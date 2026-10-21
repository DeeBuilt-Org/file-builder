import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { uuid } from "@/lib/uuid";
import { idbGet, idbSet } from "@/lib/idb";

/**
 * PackageContext — shared state for the Package (bundler) mode.
 *
 * File Builder's bundler is AGNOSTIC: you drop any files, each becomes an
 * editable row (rename, optionally put in a folder, remove), you name the ZIP,
 * and download. Nothing is scoped to a specific kit. Ruthnie's Fiverr assembly
 * line is just "drop my exported assets and name them" — same tool, no special
 * mode. The brand-kit quick-fill is a future accelerant layered on top, never
 * the default framing.
 *
 * The mode's Canvas (drop zone + file list) and Panel (zip name + download) are
 * rendered into different shell regions, so their shared state lives here.
 */

export interface BundleItem {
  id: string;
  /** The raw dropped file (the bytes). */
  file: File;
  /**
   * Output base name inside the zip, WITHOUT any folder prefix. Defaults to the
   * source filename; the user can rename it. The extension is kept on the name
   * so people can see/adjust it.
   */
  name: string;
  /**
   * Optional folder this file lands in inside the zip. Empty = zip root.
   * A plain segment like "Email_Signature" (slashes allowed for nesting).
   */
  folder: string;
  size: number;
  /** MIME type as reported by the browser (for the type badge). */
  type: string;
}

interface PackageState {
  items: BundleItem[];
  zipName: string;
  setZipName: (n: string) => void;
  addFiles: (incoming: File[]) => void;
  /** Add files that already carry a chosen name + folder (e.g. kit quick-fill). */
  addPreparedFiles: (incoming: { file: File; name: string; folder: string }[]) => void;
  updateItem: (id: string, patch: Partial<Pick<BundleItem, "name" | "folder">>) => void;
  removeItem: (id: string) => void;
  clearAll: () => void;
  /** Distinct non-empty folders currently in use, sorted. */
  folders: string[];
  totalBytes: number;
}

const Ctx = createContext<PackageState | null>(null);

const DRAFT_KEY = "bundle-draft";

/** The persisted shape. `File` is structured-cloneable, so it round-trips as-is
 *  through IndexedDB and comes back a real File with its bytes intact. */
interface PersistedDraft {
  items: BundleItem[];
  zipName: string;
}

export function PackageProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BundleItem[]>([]);
  const [zipName, setZipName] = useState("");
  // Don't write the (empty) initial state back over a saved draft before the
  // async hydrate has had a chance to load it.
  const hydrated = useRef(false);

  // Hydrate the saved draft once on mount — restores files, names, folders, zip.
  useEffect(() => {
    let alive = true;
    idbGet<PersistedDraft>(DRAFT_KEY).then((draft) => {
      if (!alive) return;
      if (draft && Array.isArray(draft.items)) {
        // Guard against a shape where a File failed to restore (older drafts).
        const restored = draft.items.filter(
          (it): it is BundleItem => it && it.file instanceof Blob,
        );
        setItems(restored);
        setZipName(draft.zipName ?? "");
      }
      hydrated.current = true;
    });
    return () => {
      alive = false;
    };
  }, []);

  // Persist on change (after hydrate), lightly debounced.
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      void idbSet<PersistedDraft>(DRAFT_KEY, { items, zipName });
    }, 300);
    return () => clearTimeout(t);
  }, [items, zipName]);

  const addFiles = useCallback((incoming: File[]) => {
    setItems((prev) => [
      ...prev,
      ...incoming.map((file) => ({
        id: uuid(),
        file,
        name: file.name,
        folder: "",
        size: file.size,
        type: file.type,
      })),
    ]);
  }, []);

  const addPreparedFiles = useCallback(
    (incoming: { file: File; name: string; folder: string }[]) => {
      setItems((prev) => [
        ...prev,
        ...incoming.map(({ file, name, folder }) => ({
          id: uuid(),
          file,
          name,
          folder,
          size: file.size,
          type: file.type,
        })),
      ]);
    },
    [],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<Pick<BundleItem, "name" | "folder">>) => {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    },
    [],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clearAll = useCallback(() => setItems([]), []);

  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const f = it.folder.trim();
      if (f) set.add(f.replace(/^\/+|\/+$/g, ""));
    }
    return Array.from(set).sort();
  }, [items]);

  const totalBytes = useMemo(
    () => items.reduce((sum, it) => sum + it.size, 0),
    [items],
  );

  const value = useMemo<PackageState>(
    () => ({
      items,
      zipName,
      setZipName,
      addFiles,
      addPreparedFiles,
      updateItem,
      removeItem,
      clearAll,
      folders,
      totalBytes,
    }),
    [items, zipName, addFiles, addPreparedFiles, updateItem, removeItem, clearAll, folders, totalBytes],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePackage(): PackageState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePackage must be used inside PackageProvider");
  return ctx;
}
