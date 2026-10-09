/**
 * marks.ts: the ONE definition of the Sign & Fill marks (checkmark, circle).
 * The on-screen overlay (`MarkSvg`) and the PDF exporter (`applyOverlay`) both
 * read from here, so the mark you place is the mark that lands in the file.
 * Nothing here touches React or the DOM.
 */

export type MarkKind = "checkmark" | "circle";

/** The checkmark outline is drawn in a square box this many units wide. */
export const CHECK_VIEWBOX = 24;

/**
 * A filled, tapered checkmark outline (SVG path data, y grows downward). Kept to
 * absolute M/L/Q/Z commands, which the browser and pdf-lib's `drawSvgPath` both
 * parse the same way. It is always scaled uniformly and centered in its box.
 */
export const CHECK_PATH =
  "M2.6 12.6 L5.4 10.4 Q7.9 12.6 9.3 15.4 Q13.6 8 21.6 3.4 Q14.4 10.6 10 20.6 Q9.6 20.9 9.2 20.6 Q6.6 15.6 2.6 12.6 Z";

/** Circle outline thickness in PDF points. Constant, whatever the oval's size. */
export const CIRCLE_STROKE_PT = 1.25;

/** The square the checkmark occupies inside a box: centered, never stretched. */
export function checkSquare(width: number, height: number) {
  const side = Math.min(width, height);
  return {
    side,
    offsetX: (width - side) / 2,
    offsetY: (height - side) / 2,
    scale: side / CHECK_VIEWBOX,
  };
}

/** Radii of the circle outline inside a box, inset so the stroke stays inside. */
export function circleRadii(width: number, height: number, stroke: number) {
  return {
    rx: Math.max(0, (width - stroke) / 2),
    ry: Math.max(0, (height - stroke) / 2),
  };
}
