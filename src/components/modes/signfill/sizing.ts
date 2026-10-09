import type { PageTextItem } from "@/lib/pdfjs";

/**
 * sizing.ts: every size rule for Sign & Fill elements lives here, so new
 * elements, the size controls, drag-resize and "apply to placed items" all agree.
 * All values are PDF points.
 */

/** The sizes every NEW element starts at. */
export interface SizeDefaults {
  /** Font size for Text, Date and Cover & fix. */
  textSize: number;
  /** Side of a checkmark's box; the circle's box is derived from it. */
  markSize: number;
}

export const FALLBACK_SIZE_DEFAULTS: SizeDefaults = { textSize: 12, markSize: 13 };

export const TEXT_SIZE_MIN = 6;
export const TEXT_SIZE_MAX = 72;
/** Smallest box a checkmark or circle can shrink to. */
export const MARK_SIZE_MIN = 6;
export const MARK_SIZE_MAX = 72;

/** A text box is one line tall: the font size plus a little breathing room. */
export const textBoxHeight = (fontSize: number) => Math.round(fontSize / 0.8);

/** The font size a text box of this height holds (inverse of textBoxHeight). */
export const fontSizeForBoxHeight = (height: number) =>
  Math.max(TEXT_SIZE_MIN, Math.round(height * 0.8));

/** A circle starts as an oval sized to wrap one short word. */
export const circleBox = (markSize: number) => ({
  width: Math.round(markSize * 2.6),
  height: Math.round(markSize * 1.4),
});

/**
 * Starting defaults for a freshly loaded PDF: the document's own most common
 * type size, so text you add sits at the form's size without resizing.
 */
export function suggestSizeDefaults(pages: { textItems: PageTextItem[] }[]): SizeDefaults {
  const sizes = pages
    .flatMap((p) => p.textItems.filter((t) => t.str.trim()).map((t) => t.fontSize))
    .sort((a, b) => a - b);
  if (sizes.length === 0) return FALLBACK_SIZE_DEFAULTS;
  const median = sizes[Math.floor(sizes.length / 2)];
  const textSize = Math.min(24, Math.max(TEXT_SIZE_MIN, median));
  return { textSize, markSize: Math.round(textSize * 1.1) };
}

/**
 * Where a text element's baseline sits, measured down from the top of its box.
 * The overlay centers one line (line-height 1) in the box, so this asks the
 * browser for the font's real ascent/descent and reproduces that layout. The
 * exporter draws at this baseline, which keeps the PDF on the same line as the
 * on-screen preview.
 */
export function textBaselineFromBoxTop(opts: {
  boxHeight: number;
  fontSize: number;
  fontCss: string;
  fontWeight: number;
}): number {
  const { boxHeight, fontSize, fontCss, fontWeight } = opts;
  // Fallback ratio if the browser can't report font metrics.
  let ratio = 0.85;
  const ctx = document.createElement("canvas").getContext("2d");
  if (ctx) {
    const probe = 100;
    ctx.font = `${fontWeight} ${probe}px ${fontCss}`;
    const m = ctx.measureText("Hg");
    const ascent = m.fontBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent;
    if (Number.isFinite(ascent) && Number.isFinite(descent) && ascent > 0) {
      ratio = (ascent + (probe - (ascent + descent)) / 2) / probe;
    }
  }
  return (boxHeight - fontSize) / 2 + fontSize * ratio;
}
