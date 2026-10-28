import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { uuid } from "@/lib/uuid";
import { loadPdfDocument, renderPageToDataUrl } from "@/lib/pdfjs";
import { getPageCount } from "@/lib/pdf-ops";
import { useUnlockGate } from "@/components/shell/UnlockGate";

/**
 * OrganizeContext — state for the Organize mode: one or more source PDFs and a
 * flat, ordered, editable list of the pages they contribute. Every operation
 * (reorder, delete, rotate, extract, merge) is expressed as edits to this page
 * list; the download simply rebuilds a PDF from it via `buildFromPages`.
 *
 * Thumbnails are rendered lazily by pdf.js and cached by (docId, pageIndex).
 * Source BYTES are kept in memory only (no IndexedDB persistence here — an
 * Organize session is transient work on a file you already have on disk, unlike
 * the Bundle draft which is an assembly you build up over time).
 */

export interface SourceDoc {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  pageCount: number;
}

export interface PageEntry {
  /** Stable id for drag-reorder + React keys. */
  id: string;
  docId: string;
  /** 0-based index within the source doc. */
  pageIndex: number;
  /** Absolute rotation applied to this page, degrees. */
  rotation: number;
  /** Whether this page is currently selected (for bulk delete/rotate/extract). */
  selected: boolean;
}

interface OrganizeState {
  docs: SourceDoc[];
  pages: PageEntry[];
  /** Whether any source is loaded. */
  hasDoc: boolean;
  /** Add one or more PDF files as sources, appending their pages to the list. */
  /** `locked` lists protected PDFs the user cancelled at the password prompt. */
  addPdfs: (files: File[]) => Promise<{ added: number; skipped: string[]; locked: string[] }>;
  /** Bytes for each docId, for the builder. */
  sources: Record<string, ArrayBuffer>;
  /** A cached thumbnail URL for a page, rendering it on first request. */
  getThumb: (docId: string, pageIndex: number) => Promise<string>;
  reorder: (fromId: string, toId: string) => void;
  toggleSelect: (id: string) => void;
  selectAll: (on: boolean) => void;
  rotatePages: (ids: string[], delta: number) => void;
  deletePages: (ids: string[]) => void;
  clearAll: () => void;
  selectedIds: string[];
  /** Name to seed the output file from (first source's name). */
  baseName: string;
}

const Ctx = createContext<OrganizeState | null>(null);

export function OrganizeProvider({ children }: { children: ReactNode }) {
  const { ensureUnlocked } = useUnlockGate();
  const [docs, setDocs] = useState<SourceDoc[]>([]);
  const [pages, setPages] = useState<PageEntry[]>([]);
  // pdf.js document handles + rendered thumbnail URLs, cached across renders.
  const docHandles = useRef(new Map<string, Awaited<ReturnType<typeof loadPdfDocument>>>());
  const thumbCache = useRef(new Map<string, string>());
  const thumbPending = useRef(new Map<string, Promise<string>>());

  const addPdfs = useCallback(async (files: File[]) => {
    const skipped: string[] = [];
    const locked: string[] = [];
    let added = 0;
    for (const file of files) {
      const isPdf =
        file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (!isPdf) {
        skipped.push(file.name);
        continue;
      }
      try {
        // A protected PDF asks for its password here; pdf-lib only ever sees
        // decrypted bytes.
        const bytes = await ensureUnlocked(await file.arrayBuffer(), file.name);
        if (!bytes) {
          locked.push(file.name);
          continue;
        }
        const pageCount = await getPageCount(bytes);
        const docId = uuid();
        setDocs((prev) => [...prev, { id: docId, name: file.name, bytes, pageCount }]);
        setPages((prev) => [
          ...prev,
          ...Array.from({ length: pageCount }, (_, i) => ({
            id: uuid(),
            docId,
            pageIndex: i,
            rotation: 0,
            selected: false,
          })),
        ]);
        added += 1;
      } catch {
        skipped.push(file.name);
      }
    }
    return { added, skipped, locked };
  }, [ensureUnlocked]);

  const sources = useMemo<Record<string, ArrayBuffer>>(() => {
    const map: Record<string, ArrayBuffer> = {};
    for (const d of docs) map[d.id] = d.bytes;
    return map;
  }, [docs]);

  const getThumb = useCallback(
    async (docId: string, pageIndex: number) => {
      const key = `${docId}:${pageIndex}`;
      const cached = thumbCache.current.get(key);
      if (cached) return cached;
      const pending = thumbPending.current.get(key);
      if (pending) return pending;

      const job = (async () => {
        let handle = docHandles.current.get(docId);
        if (!handle) {
          const doc = docs.find((d) => d.id === docId);
          if (!doc) throw new Error("Source not found");
          handle = await loadPdfDocument(doc.bytes);
          docHandles.current.set(docId, handle);
        }
        // Modest scale for a crisp-but-cheap thumbnail.
        const { url } = await renderPageToDataUrl(handle, pageIndex + 1, 0.5);
        thumbCache.current.set(key, url);
        thumbPending.current.delete(key);
        return url;
      })();
      thumbPending.current.set(key, job);
      return job;
    },
    [docs],
  );

  const reorder = useCallback((fromId: string, toId: string) => {
    setPages((prev) => {
      if (fromId === toId) return prev;
      const from = prev.findIndex((p) => p.id === fromId);
      const to = prev.findIndex((p) => p.id === toId);
      if (from < 0 || to < 0) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)));
  }, []);

  const selectAll = useCallback((on: boolean) => {
    setPages((prev) => prev.map((p) => ({ ...p, selected: on })));
  }, []);

  const rotatePages = useCallback((ids: string[], delta: number) => {
    const set = new Set(ids);
    setPages((prev) =>
      prev.map((p) =>
        set.has(p.id) ? { ...p, rotation: (((p.rotation + delta) % 360) + 360) % 360 } : p,
      ),
    );
  }, []);

  const deletePages = useCallback((ids: string[]) => {
    const set = new Set(ids);
    setPages((prev) => prev.filter((p) => !set.has(p.id)));
  }, []);

  const clearAll = useCallback(() => {
    // Revoke cached thumbnail URLs so we don't leak object URLs.
    for (const url of thumbCache.current.values()) URL.revokeObjectURL(url);
    thumbCache.current.clear();
    thumbPending.current.clear();
    docHandles.current.clear();
    setDocs([]);
    setPages([]);
  }, []);

  const selectedIds = useMemo(
    () => pages.filter((p) => p.selected).map((p) => p.id),
    [pages],
  );

  const value = useMemo<OrganizeState>(
    () => ({
      docs,
      pages,
      hasDoc: docs.length > 0,
      addPdfs,
      sources,
      getThumb,
      reorder,
      toggleSelect,
      selectAll,
      rotatePages,
      deletePages,
      clearAll,
      selectedIds,
      baseName: docs[0]?.name.replace(/\.pdf$/i, "") ?? "organized",
    }),
    [
      docs,
      pages,
      addPdfs,
      sources,
      getThumb,
      reorder,
      toggleSelect,
      selectAll,
      rotatePages,
      deletePages,
      clearAll,
      selectedIds,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrganize(): OrganizeState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrganize must be used inside OrganizeProvider");
  return ctx;
}
