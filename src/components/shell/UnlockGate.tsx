import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Modal } from "antd";
import { detectLock, unlockPdf, type PdfLock } from "@/lib/pdf-security";
import { PasswordPrompt } from "./PasswordPrompt";

/**
 * UnlockGate — every PDF mode that READS a file's contents (Organize, Sign &
 * Fill) passes its bytes through `ensureUnlocked` first.
 *
 * Why: pdf-lib can't decrypt. Before this gate, a protected PDF went straight
 * into pdf-lib and came out broken or blank with no warning. Now a protected
 * file stops here, the user enters its password, and the mode receives plain
 * decrypted bytes (or nothing, if they cancel).
 *
 * Hosted at the app root (above every mode's provider) so one modal serves all
 * modes. Requests are awaited one at a time, so dropping several protected PDFs
 * into Organize asks for each password in turn.
 */

interface Request {
  lock: Exclude<PdfLock, "none">;
  fileName: string;
  bytes: ArrayBuffer;
  resolve: (bytes: ArrayBuffer | null) => void;
}

interface UnlockGateState {
  /**
   * Resolve to bytes pdf-lib and pdf.js can read: the same bytes when the PDF
   * has no password, decrypted bytes after a correct password, or `null` when
   * the user cancels. Throws when the file isn't a readable PDF.
   */
  ensureUnlocked: (bytes: ArrayBuffer, fileName: string) => Promise<ArrayBuffer | null>;
}

const Ctx = createContext<UnlockGateState | null>(null);

/** Copy into a standalone ArrayBuffer (MuPDF output may sit on a shared buffer). */
export function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u8.byteLength);
  new Uint8Array(out).set(u8);
  return out;
}

export function UnlockGateProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);

  const ensureUnlocked = useCallback(async (bytes: ArrayBuffer, fileName: string) => {
    const lock = await detectLock(bytes);
    if (lock === "none") return bytes;
    return new Promise<ArrayBuffer | null>((resolve) => {
      setRequest({ lock, fileName, bytes, resolve });
    });
  }, []);

  const finish = (result: ArrayBuffer | null) => {
    request?.resolve(result);
    setRequest(null);
  };

  const value = useMemo<UnlockGateState>(() => ({ ensureUnlocked }), [ensureUnlocked]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal
        open={request !== null}
        footer={null}
        closable={false}
        maskClosable={false}
        destroyOnClose
        width={440}
      >
        {request && (
          <PasswordPrompt
            lock={request.lock}
            fileName={request.fileName}
            onCancel={() => finish(null)}
            onSubmit={async (password) => {
              const unlocked = await unlockPdf(request.bytes, request.lock, password);
              if (!unlocked) return false;
              finish(toArrayBuffer(unlocked));
              return true;
            }}
          />
        )}
      </Modal>
    </Ctx.Provider>
  );
}

export function useUnlockGate(): UnlockGateState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUnlockGate must be used inside UnlockGateProvider");
  return ctx;
}
