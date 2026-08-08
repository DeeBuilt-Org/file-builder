/**
 * download.ts — one reliable browser-download path, shared by every mode.
 *
 * Getting a programmatic blob download to actually save (and not get swallowed
 * by the SPA/service worker, or dropped as "non-user-initiated" after an await)
 * took real hardening in the Bundle mode. That logic lives here now so Organize,
 * Sign & Fill, and any future mode reuse the exact same battle-tested path
 * instead of re-deriving it.
 */
/**
 * The File System Access API (`showSaveFilePicker`) isn't in TypeScript's DOM lib
 * yet, so it's typed here rather than reached for with an `any` assertion. Only
 * the slice we actually use is declared.
 */
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
  id?: string;
  startIn?: string;
}
interface WritableStreamLike {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}
interface FileHandleLike {
  name: string;
  createWritable: () => Promise<WritableStreamLike>;
}
type SavePicker = (opts?: SaveFilePickerOptions) => Promise<FileHandleLike>;

function savePicker(): SavePicker | null {
  const fn = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  return typeof fn === "function" ? fn : null;
}

/** Whether "Choose where to save" can be offered in this browser. */
export function canPickSaveLocation(): boolean {
  return savePicker() !== null;
}

/** Guess a File-picker `accept` entry from a filename, so the dialog filters sanely. */
function acceptFor(fileName: string): SaveFilePickerOptions["types"] {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const mimes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
  };
  const mime = mimes[ext];
  if (!mime) return undefined;
  return [{ description: ext.slice(1).toUpperCase(), accept: { [mime]: [ext] } }];
}

/**
 * The result of a save attempt. `picked` means the user chose a location (so we
 * can say WHERE it went, and that overwriting worked); `downloaded` means we fell
 * back to the normal download path; `cancelled` means they dismissed the dialog
 * and nothing was written — callers must not report success in that case.
 */
export type SaveResult = { status: "picked"; fileName: string } | { status: "downloaded" } | { status: "cancelled" };

/**
 * Save a blob, preferring a real "Save as…" dialog when the browser supports it.
 *
 * Why this exists: the plain download path always creates a NEW file
 * (`shot.png`, `shot (1).png`, `shot (2).png`…) which turns any iterate-and-retry
 * session into a junk pile. `showSaveFilePicker` lets the user point at the same
 * file each time and overwrite it in place. Chrome/Edge support it; Firefox and
 * Safari don't, so we fall back to `downloadBlob` there rather than blocking.
 *
 * `pickerId` groups related saves so the dialog reopens in the folder last used
 * for THIS kind of output instead of a generic default.
 */
export async function saveBlob(
  blob: Blob,
  fileName: string,
  opts: { usePicker?: boolean; pickerId?: string } = {},
): Promise<SaveResult> {
  const pick = savePicker();
  if (!opts.usePicker || !pick) {
    downloadBlob(blob, fileName);
    return { status: "downloaded" };
  }
  try {
    const handle = await pick({
      suggestedName: fileName,
      types: acceptFor(fileName),
      id: opts.pickerId,
      startIn: "downloads",
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { status: "picked", fileName: handle.name || fileName };
  } catch (err) {
    // AbortError = the user dismissed the dialog. That's a deliberate "no", not a
    // failure, so we must NOT silently dump the file into Downloads instead.
    if (err instanceof DOMException && err.name === "AbortError") return { status: "cancelled" };
    // A real failure (permission denied, disk error) still deserves the file, so
    // fall back to the download path rather than losing the work.
    downloadBlob(blob, fileName);
    return { status: "downloaded" };
  }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.target = "_self";
  a.style.display = "none";
  document.body.appendChild(a);
  // A real MouseEvent (not bare .click()) is reliably treated as user-initiated
  // even after an await, so the download isn't quietly dropped.
  a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  // Keep the object URL alive briefly so the browser finishes reading the blob
  // before we revoke it.
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 4000);
}
