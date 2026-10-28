/**
 * mupdf.ts — the one lazy loader for MuPDF (Artifex, AGPL-3.0), the WASM engine
 * behind Protect, Unlock and the unlock prompt (and, later, true redaction).
 *
 * MuPDF is ~10 MB of WASM, so it never enters the main bundle. The first call
 * here dynamic-imports it; every later call reuses the same module. Someone who
 * only resizes images never downloads it.
 */
type MupdfModule = typeof import("mupdf");

let pending: Promise<MupdfModule> | null = null;

export function getMupdf(): Promise<MupdfModule> {
  if (!pending) {
    pending = import("mupdf").catch((err: unknown) => {
      // Let a failed load (offline on first use, say) be retried next time.
      pending = null;
      throw err;
    });
  }
  return pending;
}
