import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  isPdfFile,
  readSecurityFile,
  renderPreview,
  type FilePreview,
  type SecurityFile,
} from "./securityFile";

/**
 * ProtectContext — the one PDF the Protect mode is encrypting. Hosted at the app
 * root (FileBuilderApp) because Canvas and Panel render in separate shell
 * regions. Passwords are NOT stored here: they live in the panel's local state
 * and are never persisted anywhere.
 */

export type AddResult = "ok" | "not-pdf" | "unreadable";

interface ProtectState {
  file: SecurityFile | null;
  preview: FilePreview | null;
  loading: boolean;
  addFile: (file: File) => Promise<AddResult>;
  clear: () => void;
}

const Ctx = createContext<ProtectState | null>(null);

export function ProtectProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<SecurityFile | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const previewUrl = useRef<string | null>(null);

  const setPreviewTracked = (next: FilePreview | null) => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = next?.url ?? null;
    setPreview(next);
  };

  const addFile = useCallback(async (input: File): Promise<AddResult> => {
    if (!isPdfFile(input)) return "not-pdf";
    setLoading(true);
    try {
      const next = await readSecurityFile(input);
      // A file with an open password can't be previewed; the canvas explains it
      // is already protected instead.
      setPreviewTracked(next.lock === "open" ? null : await renderPreview(next.bytes));
      setFile(next);
      return "ok";
    } catch {
      return "unreadable";
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setPreviewTracked(null);
    setFile(null);
  }, []);

  const value = useMemo<ProtectState>(
    () => ({ file, preview, loading, addFile, clear }),
    [file, preview, loading, addFile, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProtect(): ProtectState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProtect must be used inside ProtectProvider");
  return ctx;
}
