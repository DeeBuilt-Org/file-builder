/**
 * image-ops.ts — the shared image toolkit.
 *
 * Every image mode (Resize, Convert, Compress) runs on these pure helpers rather
 * than inlining Canvas code into components — the "globalize, don't hardcode"
 * rule. All of this is native Canvas + `toBlob`; nothing is uploaded, no library,
 * no server. A raster image is decoded, drawn onto a canvas at the target size,
 * and re-encoded to the requested format/quality.
 *
 * SVG note: an SVG can be DECODED here (the browser rasterizes it onto the
 * canvas), so "SVG → PNG" works. Going the other way (PNG → SVG) is deliberately
 * NOT here — turning pixels back into clean vector paths is a tracing problem, a
 * different kind of tool, and faking it (wrapping the raster in an <svg>) would
 * be a hollow feature. Kept honest.
 */

/** The raster formats we can encode to via Canvas.toBlob. */
export type RasterType = "image/png" | "image/jpeg" | "image/webp";

export interface RasterFormat {
  mime: RasterType;
  /** File extension without the dot. */
  ext: string;
  label: string;
  /** Whether an encode quality (0–1) applies. PNG is lossless — no quality. */
  lossy: boolean;
}

export const RASTER_FORMATS: RasterFormat[] = [
  { mime: "image/png", ext: "png", label: "PNG", lossy: false },
  { mime: "image/jpeg", ext: "jpg", label: "JPG", lossy: true },
  { mime: "image/webp", ext: "webp", label: "WebP", lossy: true },
];

export function formatFor(mime: RasterType): RasterFormat {
  return RASTER_FORMATS.find((f) => f.mime === mime) ?? RASTER_FORMATS[0];
}

/** A decoded image plus its natural pixel dimensions. */
export interface LoadedImage {
  el: HTMLImageElement;
  width: number;
  height: number;
}

/**
 * Decode a file/blob into an <img> the Canvas can draw. Uses an object URL and
 * awaits load, then revokes. Rejects on a decode failure (a corrupt or
 * unsupported file) so callers can show a friendly message instead of drawing
 * a blank canvas.
 */
export function loadImage(file: Blob): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      URL.revokeObjectURL(url);
      if (!width || !height) {
        reject(new Error("Couldn't read that image's dimensions."));
        return;
      }
      resolve({ el: img, width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn't be read as an image."));
    };
    img.src = url;
  });
}

/** Encode a canvas to a Blob, promisified (toBlob is callback-based). */
function canvasToBlob(canvas: HTMLCanvasElement, type: RasterType, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser couldn't encode that image."));
      },
      type,
      quality,
    );
  });
}

/**
 * Draw a loaded image onto a fresh canvas at the given pixel size and return the
 * canvas. JPEG has no alpha channel, so when the target is JPEG we paint a white
 * background first — otherwise transparent PNG areas turn black.
 */
function drawToCanvas(img: LoadedImage, targetW: number, targetH: number, mime: RasterType): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetW));
  canvas.height = Math.max(1, Math.round(targetH));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser blocked the image canvas.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img.el, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Compute a target size from optional max width/height, preserving aspect ratio.
 * If neither is given, returns the natural size. Never upscales past the
 * original unless `allowUpscale` is set — enlarging a raster just blurs it.
 */
export function fitDimensions(
  natW: number,
  natH: number,
  opts: { maxW?: number; maxH?: number; allowUpscale?: boolean },
): { width: number; height: number } {
  const { maxW, maxH, allowUpscale = false } = opts;
  let scale = 1;
  if (maxW && maxW > 0) scale = Math.min(scale, maxW / natW);
  if (maxH && maxH > 0) scale = Math.min(scale, maxH / natH);
  if (!allowUpscale) scale = Math.min(scale, 1);
  // No constraints at all → keep natural size.
  if (!maxW && !maxH) scale = 1;
  return {
    width: Math.max(1, Math.round(natW * scale)),
    height: Math.max(1, Math.round(natH * scale)),
  };
}

/**
 * How an image is made to fill an EXACT target box when its aspect ratio doesn't
 * match. `fitDimensions` above can't do this — it always yields the largest size
 * that fits INSIDE the box, so one side comes up short (ask for 640×400 from a
 * 4:3 source and you get 533×400). Exact output means something has to give:
 *
 *  - `crop`    scale to COVER the box, then trim the overflow. Every output pixel
 *              is real image; the edges of the long axis are lost. What you want
 *              for a fixed-dimension submission (store listings, ad slots).
 *  - `pad`     scale to fit INSIDE the box, then fill the remainder with a
 *              background color. Nothing is lost; you get bars.
 *  - `stretch` distort to the box. Honest option, ugly result — never a default.
 */
export type FillMode = "crop" | "pad" | "stretch";

/**
 * Where the image sits inside the target box, as a 0–1 fraction on each axis.
 * 0 = flush to the left/top edge, 0.5 = centered, 1 = flush to the right/bottom.
 *
 * For `crop` this chooses which part of the overflow survives (focus point); for
 * `pad` it chooses where the image sits among the bars. The axis that isn't
 * overflowing (or padding) ignores its value — there's nothing to move.
 */
export interface FillFocus {
  x: number;
  y: number;
}

export const CENTER_FOCUS: FillFocus = { x: 0.5, y: 0.5 };

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * The geometry of drawing `natW × natH` into an exact `targetW × targetH` box.
 * Returns the destination rect in target-space: for `crop` it's LARGER than the
 * box and offset negatively (the overflow is clipped by the canvas edge); for
 * `pad` it's smaller and inset. Pure math, no canvas — so the UI can draw the
 * same preview the encoder will produce, and the two can never disagree.
 */
export function exactPlacement(
  natW: number,
  natH: number,
  targetW: number,
  targetH: number,
  fill: FillMode,
  focus: FillFocus = CENTER_FOCUS,
): { dx: number; dy: number; dw: number; dh: number; overflowX: number; overflowY: number } {
  if (fill === "stretch") {
    return { dx: 0, dy: 0, dw: targetW, dh: targetH, overflowX: 0, overflowY: 0 };
  }
  const scaleX = targetW / natW;
  const scaleY = targetH / natH;
  // COVER takes the larger scale (fill the box, spill over); CONTAIN the smaller.
  const scale = fill === "crop" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const dw = natW * scale;
  const dh = natH * scale;
  // Slack is negative for crop (overflow to hide) and positive for pad (bars to
  // distribute). The focus fraction splits it between the two sides either way.
  const slackX = targetW - dw;
  const slackY = targetH - dh;
  return {
    dx: slackX * clamp01(focus.x),
    dy: slackY * clamp01(focus.y),
    dw,
    dh,
    overflowX: Math.max(0, -slackX),
    overflowY: Math.max(0, -slackY),
  };
}

/**
 * Render an image at an EXACT pixel size. Unlike `resizeImage`, the output is
 * always precisely `width × height` — the aspect mismatch is absorbed by the
 * chosen `fill` mode rather than by shrinking a side.
 *
 * `background` paints under the image (used by `pad`, and forced opaque for JPEG
 * which has no alpha). Pass "transparent" with a PNG/WebP target for clear bars.
 */
export async function renderExactSize(
  file: Blob,
  opts: {
    width: number;
    height: number;
    fill: FillMode;
    focus?: FillFocus;
    background?: string;
    to?: RasterType;
    quality?: number;
  },
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(file);
  const width = Math.max(1, Math.round(opts.width));
  const height = Math.max(1, Math.round(opts.height));
  const mime = opts.to ?? guessMime(file);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser blocked the image canvas.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // JPEG can't store alpha, so a transparent request would encode as black —
  // fall back to white there rather than producing a surprise.
  const bg = opts.background ?? "transparent";
  const paint = mime === "image/jpeg" && (bg === "transparent" || bg === "none") ? "#ffffff" : bg;
  if (paint !== "transparent" && paint !== "none") {
    ctx.fillStyle = paint;
    ctx.fillRect(0, 0, width, height);
  }

  const { dx, dy, dw, dh } = exactPlacement(
    img.width,
    img.height,
    width,
    height,
    opts.fill,
    opts.focus ?? CENTER_FOCUS,
  );
  ctx.drawImage(img.el, dx, dy, dw, dh);

  const fmt = formatFor(mime);
  const blob = await canvasToBlob(canvas, mime, fmt.lossy ? opts.quality : undefined);
  return { blob, width, height };
}

/**
 * Resize an image to fit within max width/height (aspect preserved), re-encoding
 * to the same format family it came in as (or an explicit `to`). Returns the new
 * Blob plus its final dimensions.
 */
export async function resizeImage(
  file: Blob,
  opts: {
    maxW?: number;
    maxH?: number;
    allowUpscale?: boolean;
    to?: RasterType;
    quality?: number;
  },
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(file);
  const { width, height } = fitDimensions(img.width, img.height, opts);
  const mime = opts.to ?? guessMime(file);
  const canvas = drawToCanvas(img, width, height, mime);
  const fmt = formatFor(mime);
  const blob = await canvasToBlob(canvas, mime, fmt.lossy ? opts.quality : undefined);
  return { blob, width, height };
}

/**
 * Convert an image to a target raster format at full (natural) size. Quality
 * applies only for lossy targets (JPG/WebP).
 */
export async function convertImage(
  file: Blob,
  to: RasterType,
  quality?: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(file);
  const canvas = drawToCanvas(img, img.width, img.height, to);
  const fmt = formatFor(to);
  const blob = await canvasToBlob(canvas, to, fmt.lossy ? quality : undefined);
  return { blob, width: img.width, height: img.height };
}

/**
 * Compress an image: re-encode at a given quality, optionally capping the width.
 * PNG is lossless so "compressing" a PNG that stays PNG mostly just strips
 * metadata and won't shrink much — callers should surface that honestly (or nudge
 * toward WebP/JPG). The real wins come from a lossy target.
 */
export async function compressImage(
  file: Blob,
  opts: { quality: number; maxW?: number; to?: RasterType },
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(file);
  const { width, height } = fitDimensions(img.width, img.height, { maxW: opts.maxW });
  const mime = opts.to ?? guessMime(file);
  const canvas = drawToCanvas(img, width, height, mime);
  const fmt = formatFor(mime);
  const blob = await canvasToBlob(canvas, mime, fmt.lossy ? opts.quality : undefined);
  return { blob, width, height };
}

/**
 * Best-guess the encodable MIME for a blob. Canvas can only emit png/jpeg/webp,
 * so anything else (svg, gif, bmp, ico…) is normalized to PNG for the OUTPUT —
 * the input is still decoded fine, we just can't re-emit those formats. Reads the
 * filename extension too, since a dropped file sometimes has an empty `type`.
 */
export function guessMime(file: Blob): RasterType {
  const t = file.type;
  if (t === "image/jpeg" || t === "image/webp" || t === "image/png") return t;
  const name = (file as File).name ?? "";
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

/**
 * An output-format choice from the UI: "keep" means "same everyday format the
 * image already is" (a JPG stays a JPG). This is the safe default — the tool
 * never silently changes someone's file into a format they didn't ask for.
 */
export type OutputFormat = "keep" | RasterType;

/** Resolve an OutputFormat against a source file to a concrete encodable MIME. */
export function resolveOutput(choice: OutputFormat, file: Blob): RasterType {
  return choice === "keep" ? guessMime(file) : choice;
}

/**
 * Short label for the detected source format of a file, e.g. "PNG". Used to show
 * the user WHAT "keep original" will actually produce, rather than a vague word.
 * Returns null when there's no file to detect from.
 */
export function detectedLabel(file: Blob | undefined): string | null {
  if (!file) return null;
  return formatFor(guessMime(file)).label;
}

/** Swap (or add) a file extension. `photo.png` + `jpg` → `photo.jpg`. */
export function withExt(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${ext}`;
}

/** Human file size — "26 kB", "1.4 MB". */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Percent smaller (positive) or larger (negative) than the original. */
export function sizeDelta(before: number, after: number): number {
  if (before === 0) return 0;
  return Math.round(((before - after) / before) * 100);
}
