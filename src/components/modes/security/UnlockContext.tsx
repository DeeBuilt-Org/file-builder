import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { unlockPdf } from "@/lib/pdf-security";
import { toArrayBuffer } from "@/components/shell/UnlockGate";
import type { AddResult } from "./ProtectContext";
import {
  isPdfFile,
  readSecurityFile,
  renderPreview,
  type FilePreview,
  type SecurityFile,
} from "./securityFile";

/**
 * UnlockContext — the one PDF the Unlock mode is removing a password from, and
 * the unlocked bytes once the password is accepted. Hosted at the app root like
 * every other mode's state. The password itself is never stored.
 */

interface UnlockState {
  file: SecurityFile | null;
  preview: FilePreview | null;
  loading: boolean;
  /** Plain, unencrypted bytes after a correct password; `null` until then. */
  unlocked: ArrayBuffer | null;
  addFile: (file: File) => Promise<AddResult>;
  /** `true` when the password was accepted. */
  unlock: (password: string) => Promise<boolean>;
  clear: () => void;
}

const Ctx = createContext<UnlockState | null>(null);

export function UnlockProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<SecurityFile | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [unlocked, setUnlocked] = useState<ArrayBuffer | null>(null);
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
      setPreviewTracked(next.lock === "open" ? null : await renderPreview(next.bytes));
      setUnlocked(null);
      setFile(next);
      return "ok";
    } catch {
      return "unreadable";
    } finally {
      setLoading(false);
    }
  }, []);

  const unlock = useCallback(
    async (password: string) => {
      if (!file || file.lock === "none") return false;
      const result = await unlockPdf(file.bytes, file.lock, password);
      if (!result) return false;
      const bytes = toArrayBuffer(result);
      setPreviewTracked(await renderPreview(bytes));
      setUnlocked(bytes);
      return true;
    },
    [file],
  );

  const clear = useCallback(() => {
    setPreviewTracked(null);
    setUnlocked(null);
    setFile(null);
  }, []);

  const value = useMemo<UnlockState>(
    () => ({ file, preview, loading, unlocked, addFile, unlock, clear }),
    [file, preview, loading, unlocked, addFile, unlock, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUnlock(): UnlockState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUnlock must be used inside UnlockProvider");
  return ctx;
}
