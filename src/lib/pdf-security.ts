import { getMupdf } from "./mupdf";

/**
 * pdf-security.ts — PDF passwords: detect, unlock, protect. Pure functions over
 * bytes, like `pdf-ops.ts`; nothing here touches React or the DOM.
 *
 * pdf-lib can neither encrypt nor decrypt, so this file uses MuPDF (lazy-loaded
 * through `getMupdf`). Everything runs on the user's device; no bytes leave it.
 *
 * How PDF passwords work (the domain rules every caller relies on):
 * - The OPEN password (PDF "user password") encrypts the file. Nobody can read
 *   it without the password. That is the only real protection.
 * - The PERMISSIONS password (PDF "owner password") sets flags that ask readers
 *   to block printing, copying or editing. Acrobat honors them; many tools
 *   ignore them. A file with restrictions and no open password opens for anyone,
 *   but its contents are still encrypted, so pdf-lib cannot read it until it is
 *   unlocked.
 * - Always AES-256. RC4 and AES-128 are obsolete and never offered.
 */

export type PdfBytes = Uint8Array;

/** What kind of password a PDF carries. */
export type PdfLock = "none" | "open" | "restrictions";

/** `authenticatePassword` result bits (MuPDF / ISO 32000). */
const AUTH_USER = 2;
const AUTH_OWNER = 4;

const ENCRYPT_TOKEN = new TextEncoder().encode("/Encrypt");

/**
 * Cheap pre-check: an encrypted PDF always names `/Encrypt` in its trailer or
 * xref-stream dictionary, both of which are stored unencrypted. If the token is
 * absent, the file is certainly not encrypted and MuPDF never has to load. A
 * false positive only costs a MuPDF check, never a wrong answer.
 */
function mentionsEncrypt(bytes: Uint8Array): boolean {
  const first = ENCRYPT_TOKEN[0];
  const last = bytes.length - ENCRYPT_TOKEN.length;
  outer: for (let i = 0; i <= last; i += 1) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < ENCRYPT_TOKEN.length; j += 1) {
      if (bytes[i + j] !== ENCRYPT_TOKEN[j]) continue outer;
    }
    return true;
  }
  return false;
}

function toU8(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** Which password, if any, a PDF carries. Throws if the file isn't a readable PDF. */
export async function detectLock(data: ArrayBuffer | Uint8Array): Promise<PdfLock> {
  const bytes = toU8(data);
  if (!mentionsEncrypt(bytes)) return "none";
  const mupdf = await getMupdf();
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const pdf = doc.asPDF();
    if (!pdf || pdf.getTrailer().get("Encrypt").isNull()) return "none";
    return doc.needsPassword() ? "open" : "restrictions";
  } finally {
    doc.destroy();
  }
}

/**
 * Remove the password from a PDF and return plain, unencrypted bytes. Returns
 * `null` when the password is wrong.
 *
 * - "open" files accept the open password (or the permissions password, which
 *   also opens the file under the PDF standard).
 * - "restrictions" files accept ONLY the permissions password. Unlock removes a
 *   password the user knows; it does not strip someone else's restrictions.
 */
export async function unlockPdf(
  data: ArrayBuffer | Uint8Array,
  lock: Exclude<PdfLock, "none">,
  password: string,
): Promise<PdfBytes | null> {
  const mupdf = await getMupdf();
  const doc = mupdf.Document.openDocument(toU8(data), "application/pdf");
  try {
    const result = doc.authenticatePassword(password);
    const accepted =
      lock === "open" ? (result & (AUTH_USER | AUTH_OWNER)) !== 0 : (result & AUTH_OWNER) !== 0;
    if (!accepted) return null;
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("Not a PDF");
    // `asUint8Array` is a view into WASM memory; copy it before the doc is freed.
    return pdf.saveToBuffer("encrypt=none").asUint8Array().slice();
  } finally {
    doc.destroy();
  }
}

/** What a protected PDF still allows. `true` = allowed. */
export interface PdfPermissions {
  print: boolean;
  copy: boolean;
  edit: boolean;
  comment: boolean;
  fillForms: boolean;
}

export const ALL_PERMISSIONS: PdfPermissions = {
  print: true,
  copy: true,
  edit: true,
  comment: true,
  fillForms: true,
};

export function hasRestrictions(p: PdfPermissions): boolean {
  return !(p.print && p.copy && p.edit && p.comment && p.fillForms);
}

/**
 * The PDF permission bitfield `P` (ISO 32000 Table 22), built from switches so
 * no one ever hand-types it. Bits are 1-indexed in the spec:
 * 3 print · 4 modify · 5 copy · 6 comment · 9 fill forms · 10 accessibility ·
 * 11 assemble pages · 12 high-quality print. Bits 7–8 and 13–32 must be 1 and
 * bits 1–2 must be 0, which is the base mask below. Accessibility extraction
 * (screen readers) is always allowed.
 */
export function permissionsBits(p: PdfPermissions): number {
  let bits = 0xfffff0c0 | 0; // required bits, as a signed 32-bit integer
  bits |= 1 << 9; // accessibility
  if (p.print) bits |= (1 << 2) | (1 << 11);
  if (p.edit) bits |= (1 << 3) | (1 << 10);
  if (p.copy) bits |= 1 << 4;
  if (p.comment) bits |= 1 << 5;
  if (p.fillForms) bits |= 1 << 8;
  return bits;
}

/**
 * Why a password can't be used, or `null` if it's fine. MuPDF reads its save
 * options as a comma-separated list with no escaping, so a comma would split the
 * password (tested 2026-10-28: `a,b=c` throws "Unused pdf arguments"). Equals
 * signs, spaces and accented letters all work.
 */
export function passwordProblem(password: string): string | null {
  if (password.length === 0) return "Enter a password.";
  if (password.includes(",")) return "Passwords can't contain a comma.";
  return null;
}

/** A random 16-character password with no look-alike characters and no commas. */
export function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const values = new Uint32Array(16);
  // getRandomValues works on plain http too (unlike crypto.randomUUID).
  crypto.getRandomValues(values);
  return Array.from(values, (v) => alphabet[v % alphabet.length]).join("");
}

export interface ProtectOptions {
  openPassword: string;
  /**
   * Always set, even with no restrictions: an EMPTY owner password lets some
   * tools open the file with no password at all. When there are no
   * restrictions, pass a random one the user never needs.
   */
  ownerPassword: string;
  permissions: PdfPermissions;
}

/** Encrypt a PDF with AES-256. The input must not already be protected. */
export async function protectPdf(
  data: ArrayBuffer | Uint8Array,
  opts: ProtectOptions,
): Promise<PdfBytes> {
  for (const pw of [opts.openPassword, opts.ownerPassword]) {
    const problem = passwordProblem(pw);
    if (problem) throw new Error(problem);
  }
  const mupdf = await getMupdf();
  const doc = mupdf.Document.openDocument(toU8(data), "application/pdf");
  try {
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("Not a PDF");
    const options = [
      "encrypt=aes-256",
      `user-password=${opts.openPassword}`,
      `owner-password=${opts.ownerPassword}`,
      `permissions=${permissionsBits(opts.permissions)}`,
    ].join(",");
    return pdf.saveToBuffer(options).asUint8Array().slice();
  } finally {
    doc.destroy();
  }
}
