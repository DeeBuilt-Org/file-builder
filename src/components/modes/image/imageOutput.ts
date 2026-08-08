import JSZip from "jszip";
import { saveBlob, type SaveResult } from "@/lib/download";

/**
 * Deliver a batch of processed images: one file downloads directly; several get
 * zipped so the user gets a single clean download rather than a burst of browser
 * save prompts. Shared by every image mode's "Download" action.
 *
 * Images are already compressed bytes (PNG/JPG/WebP), so the ZIP STOREs them (no
 * pointless DEFLATE pass) — matches the Bundle mode's decision.
 */
export interface OutputFile {
  name: string;
  blob: Blob;
}

export async function deliverImages(
  files: OutputFile[],
  zipName: string,
  opts: { usePicker?: boolean } = {},
): Promise<SaveResult> {
  if (files.length === 0) return { status: "cancelled" };
  if (files.length === 1) {
    return saveBlob(files[0].blob, files[0].name, { usePicker: opts.usePicker, pickerId: "fb-image" });
  }
  const zip = new JSZip();
  const used = new Set<string>();
  for (const f of files) {
    let name = f.name;
    // De-collide duplicate names so nothing silently overwrites in the archive.
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let n = 2;
      while (used.has(`${base}-${n}${ext}`)) n += 1;
      name = `${base}-${n}${ext}`;
    }
    used.add(name);
    zip.file(name, f.blob, { compression: "STORE" });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const safe = zipName.trim().replace(/\.zip$/i, "") || "images";
  return saveBlob(blob, `${safe}.zip`, { usePicker: opts.usePicker, pickerId: "fb-image-zip" });
}
