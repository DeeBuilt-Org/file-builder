import { uuid } from "@/lib/uuid";
import { loadPdfDocument, renderPageToDataUrl } from "@/lib/pdfjs";
import { detectLock, type PdfLock } from "@/lib/pdf-security";

/**
 * The one PDF that Protect or Unlock is working on. Kept in memory only, like
 * Organize: this is transient work on a file the user already has on disk.
 */
export interface SecurityFile {
  id: string;
  name: string;
  size: number;
  bytes: ArrayBuffer;
  lock: PdfLock;
}

/** First-page preview for the file card. The caller owns and revokes `url`. */
export interface FilePreview {
  url: string;
  pageCount: number;
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Read a dropped PDF and find out which password, if any, it carries. */
export async function readSecurityFile(file: File): Promise<SecurityFile> {
  const bytes = await file.arrayBuffer();
  const lock = await detectLock(bytes);
  return { id: uuid(), name: file.name, size: file.size, bytes, lock };
}

/**
 * Render page 1. Only call this for bytes pdf.js can open without a password
 * (no lock, a restrictions-only lock, or after unlocking).
 */
export async function renderPreview(bytes: ArrayBuffer): Promise<FilePreview> {
  const doc = await loadPdfDocument(bytes);
  try {
    const { url } = await renderPageToDataUrl(doc, 1, 0.6);
    return { url, pageCount: doc.numPages };
  } finally {
    void doc.destroy();
  }
}

/** "contract.pdf" → "contract-protected.pdf". */
export function suffixedName(name: string, suffix: string): string {
  return `${name.replace(/\.pdf$/i, "")}-${suffix}.pdf`;
}
