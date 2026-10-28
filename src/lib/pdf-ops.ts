import {
  PDFDocument,
  degrees,
  rgb,
  StandardFonts,
  type PDFFont,
  type Color,
} from "pdf-lib";
import { CHECK_PATH, CIRCLE_STROKE_PT, checkSquare, circleRadii } from "./marks";

/**
 * pdf-ops.ts — the WRITE side of File Builder's PDF editing. Every structural
 * and stamping operation is a pure function here: hand it bytes (and params),
 * get back new PDF bytes. Nothing here touches React, the DOM, or component
 * state — the Organize and Sign & Fill modes import these and wire them to UI.
 *
 * Rendering pixels to the screen is the OTHER half (`pdfjs.ts`, pdf.js). This
 * file never renders; it only rewrites the document.
 *
 * All of this runs 100% client-side — the whole point of the tool. No bytes ever
 * leave the browser.
 */

export type PdfBytes = Uint8Array;

/** Load a document from raw bytes. pdf-lib parses lazily; this can throw on a
 *  corrupt file, so callers should try/catch and show a friendly note.
 *
 *  pdf-lib cannot decrypt, so encrypted bytes must never reach it: modes pass
 *  every file through the unlock gate (`UnlockGate.tsx`) first. This used to set
 *  `ignoreEncryption: true`, which let a protected PDF through and silently
 *  produced a broken or blank file. Without it, pdf-lib throws instead, so a
 *  file that somehow skips the gate fails loudly rather than corrupting output. */
export async function loadPdf(data: ArrayBuffer | Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(data);
}

/** Page count without keeping the document around. */
export async function getPageCount(data: ArrayBuffer | Uint8Array): Promise<number> {
  const doc = await loadPdf(data);
  return doc.getPageCount();
}

/**
 * Rebuild a single PDF from an ordered list of pages drawn from one or more
 * source documents. This is the workhorse that powers reorder, delete, extract,
 * and merge — all four are just "which source pages, in what order."
 *
 * `pages` is a flat, ordered list of { docId, pageIndex }. `sources` maps each
 * docId to its bytes. Rotation (if any) is applied per output page.
 */
export interface OutputPageRef {
  docId: string;
  /** 0-based index within that source document. */
  pageIndex: number;
  /** Absolute rotation to apply to this page, in degrees (0/90/180/270). */
  rotation?: number;
}

export async function buildFromPages(
  sources: Record<string, ArrayBuffer | Uint8Array>,
  pages: OutputPageRef[],
): Promise<PdfBytes> {
  const out = await PDFDocument.create();
  // Cache each loaded source doc so we parse it once even when many of its pages
  // are used.
  const loaded = new Map<string, PDFDocument>();
  const getDoc = async (docId: string) => {
    let d = loaded.get(docId);
    if (!d) {
      const bytes = sources[docId];
      if (!bytes) throw new Error(`Missing source document: ${docId}`);
      d = await loadPdf(bytes);
      loaded.set(docId, d);
    }
    return d;
  };

  for (const ref of pages) {
    const src = await getDoc(ref.docId);
    const [copied] = await out.copyPages(src, [ref.pageIndex]);
    if (typeof ref.rotation === "number" && ref.rotation !== 0) {
      // Absolute rotation: normalize to 0/90/180/270.
      copied.setRotation(degrees(((ref.rotation % 360) + 360) % 360));
    }
    out.addPage(copied);
  }
  return out.save();
}

/** Merge several whole PDFs into one, in the order given. */
export async function mergePdfs(docs: (ArrayBuffer | Uint8Array)[]): Promise<PdfBytes> {
  const out = await PDFDocument.create();
  for (const bytes of docs) {
    const src = await loadPdf(bytes);
    const indices = src.getPageIndices();
    const copied = await out.copyPages(src, indices);
    copied.forEach((p) => out.addPage(p));
  }
  return out.save();
}

/**
 * Stamp text onto a page. Coordinates are given TOP-LEFT origin, in PDF points,
 * matching how the UI overlay thinks (y grows downward on screen). We convert to
 * pdf-lib's bottom-left origin here so callers never juggle it.
 */
export interface TextStamp {
  pageIndex: number;
  text: string;
  /** Top-left x of the text box, in PDF points. */
  x: number;
  /** Top-left y of the text box, in PDF points (measured from the page top). */
  y: number;
  size: number;
  /**
   * Distance from the box top down to the text baseline, in points. The caller
   * measures this from the on-screen layout so the exported line sits where the
   * preview showed it. Defaults to 0.8 x size (text hugging the box top).
   */
  baseline?: number;
  color?: { r: number; g: number; b: number }; // 0..1
  font?: "Helvetica" | "Helvetica-Bold" | "Times-Roman" | "Courier";
  /**
   * An embedded custom font from the shared library. When present it overrides
   * `font` — the real font bytes are embedded via fontkit so the exported PDF
   * matches the on-screen preview exactly. `key` de-dupes embeds across stamps.
   */
  customFont?: { key: string; bytes: ArrayBuffer };
}

export interface ImageStamp {
  pageIndex: number;
  /** PNG or JPEG bytes. */
  bytes: ArrayBuffer | Uint8Array;
  format: "png" | "jpg";
  /** Top-left x, in PDF points. */
  x: number;
  /** Top-left y, in PDF points (from page top). */
  y: number;
  width: number;
  height: number;
}

/**
 * A vector checkmark drawn within a box (no font glyph needed). The shape comes
 * from `marks.ts`, the same outline the on-screen overlay draws; it is scaled
 * uniformly and centered in the box, never stretched.
 */
export interface CheckStamp {
  pageIndex: number;
  /** Top-left x, in PDF points. */
  x: number;
  /** Top-left y, in PDF points (from page top). */
  y: number;
  width: number;
  height: number;
  color?: { r: number; g: number; b: number };
}

/** An outlined oval filling a box, for circling an option on a form. */
export interface CircleStamp {
  pageIndex: number;
  /** Top-left x, in PDF points. */
  x: number;
  /** Top-left y, in PDF points (from page top). */
  y: number;
  width: number;
  height: number;
  color?: { r: number; g: number; b: number };
}

export interface RectStamp {
  pageIndex: number;
  /** Top-left x, in PDF points. */
  x: number;
  /** Top-left y, in PDF points (from page top). */
  y: number;
  width: number;
  height: number;
  /** Fill color 0..1; defaults to white (the cover/white-out case). */
  color?: { r: number; g: number; b: number };
}

const FONT_MAP: Record<NonNullable<TextStamp["font"]>, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica,
  "Helvetica-Bold": StandardFonts.HelveticaBold,
  "Times-Roman": StandardFonts.TimesRoman,
  Courier: StandardFonts.Courier,
};

function toColor(c?: { r: number; g: number; b: number }): Color {
  if (!c) return rgb(0, 0, 0);
  return rgb(c.r, c.g, c.b);
}

/**
 * Apply a set of overlay stamps (rects first, then images, then text — so text
 * lands on top of a white-out box) to a document and return the flattened bytes.
 * This is the single save path for Sign & Fill: everything the user placed on
 * screen is baked into the real PDF here.
 */
export async function applyOverlay(
  data: ArrayBuffer | Uint8Array,
  overlay: {
    rects?: RectStamp[];
    images?: ImageStamp[];
    texts?: TextStamp[];
    checks?: CheckStamp[];
    circles?: CircleStamp[];
  },
): Promise<PdfBytes> {
  const doc = await loadPdf(data);
  // fontkit (needed only to embed custom library fonts) is loaded on demand so
  // it stays out of the initial bundle — most sessions never export text.
  if (overlay.texts?.some((t) => t.customFont)) {
    const { default: fontkit } = await import("@pdf-lib/fontkit");
    doc.registerFontkit(fontkit);
  }
  const pages = doc.getPages();

  // A page's rotation changes how our top-left screen coordinates map onto its
  // content box. We only support the common upright + quarter-turn cases; the UI
  // renders the page as pdf.js draws it (rotation-applied), so we translate the
  // screen-space box into the page's UNrotated content space before drawing.
  const place = (
    pageIndex: number,
    box: { x: number; y: number; width: number; height: number },
  ) => {
    const page = pages[pageIndex];
    if (!page) return null;
    const { width: pw, height: ph } = page.getSize();
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    // Screen space (what the user saw) has top-left origin and matches the
    // rotated viewport. Convert to the page's own bottom-left content space.
    // For each rotation we map the top-left-origin (sx, sy) box to pdf-lib's
    // bottom-left-origin draw position and swap dims where the axes swap.
    const { x: sx, y: sy, width: bw, height: bh } = box;
    if (rot === 90) {
      return { x: sy, y: sx, width: bh, height: bw, angle: -90 };
    }
    if (rot === 180) {
      return { x: pw - sx - bw, y: sy, width: bw, height: bh, angle: 180 };
    }
    if (rot === 270) {
      return { x: ph - sy - bh, y: pw - sx - bw, width: bh, height: bw, angle: -270 };
    }
    // upright
    return { x: sx, y: ph - sy - bh, width: bw, height: bh, angle: 0 };
  };

  // Rects (white-out / cover) go down first.
  for (const r of overlay.rects ?? []) {
    const p = place(r.pageIndex, r);
    const page = pages[r.pageIndex];
    if (!p || !page) continue;
    page.drawRectangle({
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      color: toColor(r.color ?? { r: 1, g: 1, b: 1 }),
      rotate: degrees(p.angle),
    });
  }

  // Checkmarks: the shared filled outline from marks.ts (no font glyph for a
  // check exists in the standard Latin set, so we draw it rather than type it).
  // Scaled uniformly and centered in the box, exactly as the overlay shows it.
  for (const c of overlay.checks ?? []) {
    const page = pages[c.pageIndex];
    const p = place(c.pageIndex, c);
    if (!page || !p) continue;
    const sq = checkSquare(p.width, p.height);
    // drawSvgPath takes the path's top-left origin, with the path's y running
    // down the page from there.
    page.drawSvgPath(CHECK_PATH, {
      x: p.x + sq.offsetX,
      y: p.y + p.height - sq.offsetY,
      scale: sq.scale,
      color: toColor(c.color ?? { r: 0, g: 0.4, b: 0.1 }),
      borderWidth: 0,
    });
  }

  // Circles: an outlined oval filling the box, stroke kept inside its edges.
  for (const c of overlay.circles ?? []) {
    const page = pages[c.pageIndex];
    const p = place(c.pageIndex, c);
    if (!page || !p) continue;
    const { rx, ry } = circleRadii(p.width, p.height, CIRCLE_STROKE_PT);
    page.drawEllipse({
      x: p.x + p.width / 2,
      y: p.y + p.height / 2,
      xScale: rx,
      yScale: ry,
      borderColor: toColor(c.color ?? { r: 0, g: 0.4, b: 0.1 }),
      borderWidth: CIRCLE_STROKE_PT,
    });
  }

  // Images (signatures, stamps) next.
  for (const img of overlay.images ?? []) {
    const page = pages[img.pageIndex];
    if (!page) continue;
    const embedded =
      img.format === "png"
        ? await doc.embedPng(img.bytes)
        : await doc.embedJpg(img.bytes);
    const p = place(img.pageIndex, img);
    if (!p) continue;
    page.drawImage(embedded, {
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      rotate: degrees(p.angle),
    });
  }

  // Text on top. Two font sources: the 4 standard fonts (by name) and embedded
  // custom fonts from the shared library (by bytes, via fontkit). Both cached.
  const stdCache = new Map<string, PDFFont>();
  const customCache = new Map<string, PDFFont>();
  const getStdFont = async (name: NonNullable<TextStamp["font"]>) => {
    let f = stdCache.get(name);
    if (!f) {
      f = await doc.embedFont(FONT_MAP[name]);
      stdCache.set(name, f);
    }
    return f;
  };
  const getCustomFont = async (cf: NonNullable<TextStamp["customFont"]>) => {
    let f = customCache.get(cf.key);
    if (!f) {
      // subset:true keeps only the glyphs actually used → small embed.
      f = await doc.embedFont(cf.bytes, { subset: true });
      customCache.set(cf.key, f);
    }
    return f;
  };

  for (const t of overlay.texts ?? []) {
    const page = pages[t.pageIndex];
    if (!page) continue;
    let font: PDFFont;
    if (t.customFont) {
      try {
        font = await getCustomFont(t.customFont);
      } catch {
        // A font that fontkit can't embed (rare) falls back to a standard one
        // rather than dropping the text entirely.
        font = await getStdFont(t.font ?? "Helvetica");
      }
    } else {
      font = await getStdFont(t.font ?? "Helvetica");
    }
    // The overlay gives the box's top-left; text baselines sit above the box
    // bottom. Treat the box height as one line of `size`, with the baseline
    // ~0.8em down from the top — good enough for a single stamped line.
    const ascent = t.size * 0.8;
    // When the caller measured the real on-screen baseline, shift the line's
    // top so the 0.8em rule below lands the text exactly on it.
    const lineTop = t.y + ((t.baseline ?? ascent) - ascent);
    const p = place(t.pageIndex, { x: t.x, y: lineTop, width: 0, height: t.size });
    if (!p) continue;
    // For upright pages we want the baseline at (top - ascent). place() returned
    // the box bottom in page space for a height of `size`; add (size - ascent).
    try {
      page.drawText(t.text, {
        x: p.x,
        y: p.y + (t.size - ascent),
        size: t.size,
        font,
        color: toColor(t.color),
        rotate: degrees(p.angle),
      });
    } catch {
      // A glyph the chosen font can't encode (e.g. a symbol outside the Latin
      // subset) would otherwise throw and abort the whole save. Retry with the
      // characters the font DOES support, dropping the rest, so the export still
      // succeeds and every other stamp lands.
      const safe = [...t.text]
        .filter((ch) => {
          try {
            font.widthOfTextAtSize(ch, t.size);
            return true;
          } catch {
            return false;
          }
        })
        .join("");
      if (safe) {
        page.drawText(safe, {
          x: p.x,
          y: p.y + (t.size - ascent),
          size: t.size,
          font,
          color: toColor(t.color),
          rotate: degrees(p.angle),
        });
      }
    }
  }

  return doc.save();
}

/** The AcroForm fields present in a PDF, described for the Fill UI. */
export interface FormFieldInfo {
  name: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "optionlist" | "button" | "other";
  /** For radio/dropdown/optionlist: the selectable options. */
  options?: string[];
  /** Current value(s) where readable. */
  value?: string | boolean;
}

/** Read the interactive form fields (if any) from a PDF. */
export async function readFormFields(
  data: ArrayBuffer | Uint8Array,
): Promise<FormFieldInfo[]> {
  const doc = await loadPdf(data);
  const form = doc.getForm();
  const fields = form.getFields();
  return fields.map((f) => {
    const name = f.getName();
    const ctor = f.constructor.name;
    if (ctor === "PDFTextField") {
      const tf = form.getTextField(name);
      return { name, type: "text" as const, value: tf.getText() ?? "" };
    }
    if (ctor === "PDFCheckBox") {
      const cb = form.getCheckBox(name);
      return { name, type: "checkbox" as const, value: cb.isChecked() };
    }
    if (ctor === "PDFRadioGroup") {
      const rg = form.getRadioGroup(name);
      return {
        name,
        type: "radio" as const,
        options: rg.getOptions(),
        value: rg.getSelected() ?? "",
      };
    }
    if (ctor === "PDFDropdown") {
      const dd = form.getDropdown(name);
      return {
        name,
        type: "dropdown" as const,
        options: dd.getOptions(),
        value: dd.getSelected()[0] ?? "",
      };
    }
    if (ctor === "PDFOptionList") {
      const ol = form.getOptionList(name);
      return { name, type: "optionlist" as const, options: ol.getOptions() };
    }
    if (ctor === "PDFButton") {
      return { name, type: "button" as const };
    }
    return { name, type: "other" as const };
  });
}

/** Apply a set of form-field values and return flattened-or-kept bytes. */
export async function fillFormFields(
  data: ArrayBuffer | Uint8Array,
  values: Record<string, string | boolean>,
  flatten: boolean,
): Promise<PdfBytes> {
  const doc = await loadPdf(data);
  const form = doc.getForm();
  for (const [name, value] of Object.entries(values)) {
    const field = form.getFields().find((f) => f.getName() === name);
    if (!field) continue;
    const ctor = field.constructor.name;
    try {
      if (ctor === "PDFTextField" && typeof value === "string") {
        form.getTextField(name).setText(value);
      } else if (ctor === "PDFCheckBox" && typeof value === "boolean") {
        const cb = form.getCheckBox(name);
        if (value) cb.check();
        else cb.uncheck();
      } else if (ctor === "PDFRadioGroup" && typeof value === "string" && value) {
        form.getRadioGroup(name).select(value);
      } else if (ctor === "PDFDropdown" && typeof value === "string" && value) {
        form.getDropdown(name).select(value);
      }
    } catch {
      // A single bad field shouldn't sink the whole fill — skip it.
    }
  }
  if (flatten) form.flatten();
  return doc.save();
}
