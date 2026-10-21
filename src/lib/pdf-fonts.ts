import fontManifest from "../../public/fonts/manifest.json";
import {
  FONT_PAIRINGS,
  cssFamily,
  type FontSpec,
} from "@/lib/shared-fonts";

/** Inject one family's Google-Fonts stylesheet for on-screen preview. Idempotent. */
const injectedFamilies = new Set<string>();
export function loadFontForPreview(family: string): void {
  if (typeof document === "undefined" || injectedFamilies.has(family)) return;
  const opt = PDF_FONT_OPTIONS.find((o) => o.family === family);
  if (!opt) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=" +
    opt.spec.googleParam +
    "&display=swap";
  document.head.appendChild(link);
  injectedFamilies.add(family);
}

/**
 * pdf-fonts.ts — bridges the shared font library to the PDF exporter.
 *
 * Two jobs:
 *  1. Give the Sign & Fill picker the FULL list of library fonts (every distinct
 *     family, in the library's order) — not a hand-picked subset.
 *  2. For a picked font, provide BOTH: a CSS family for the on-screen overlay
 *     (rendered via the library's Google-Fonts loader) AND the actual WOFF bytes
 *     for pdf-lib+fontkit to embed, so the DOWNLOADED PDF matches the preview.
 *
 * The bytes are vendored under public/fonts/ (see scripts/fetch-fonts.mjs) and
 * fetched from our own origin only — a user's PDF text never leaves the browser.
 */

const MANIFEST = fontManifest as Record<string, string>;

/** One selectable font in the picker (a distinct family + a default weight). */
export interface PdfFontOption {
  /** Google family name — the stable key, e.g. "Playfair Display". */
  family: string;
  /** CSS font-family stack for on-screen rendering. */
  css: string;
  /** The weight we embed/preview for this family (its heaviest declared or 400). */
  weight: number;
  /** The library FontSpec this came from (carries classification, weights…). */
  spec: FontSpec;
}

// Base path so a hashed/base-prefixed deploy resolves the font files. Vite
// exposes the configured `base` here.
const BASE = import.meta.env.BASE_URL ?? "/";

/**
 * Build the distinct-family option list from the library. A family can appear as
 * both a heading and a body; we key by family and keep the first spec seen, but
 * prefer the widest weight set so bold is available where the library declares
 * it.
 */
export const PDF_FONT_OPTIONS: PdfFontOption[] = (() => {
  const byFamily = new Map<string, FontSpec>();
  for (const p of FONT_PAIRINGS) {
    for (const spec of [p.heading, p.body]) {
      const existing = byFamily.get(spec.family);
      if (!existing || spec.weights.length > existing.weights.length) {
        byFamily.set(spec.family, spec);
      }
    }
  }
  const out: PdfFontOption[] = [];
  for (const [family, spec] of byFamily) {
    // Choose a weight we actually have a file for: prefer 400 (regular, best for
    // body/document text), else the lightest we downloaded.
    const available = spec.weights.filter((w) => MANIFEST[`${family}::${w}`]);
    const weight =
      available.includes(400) ? 400 : available.length ? Math.min(...available) : spec.weights[0];
    out.push({ family, css: cssFamily(spec), weight, spec });
  }
  // Alphabetical — a long list is easiest to scan by name.
  out.sort((a, b) => a.family.localeCompare(b.family));
  return out;
})();

/** Look up an option by family (falls back to the first). */
export function getFontOption(family: string): PdfFontOption {
  return PDF_FONT_OPTIONS.find((o) => o.family === family) ?? PDF_FONT_OPTIONS[0];
}

/**
 * Given a font family name read from an existing PDF (e.g. "TimesNewRomanPSMT",
 * "ArialMT", "Georgia", "CourierNew"), suggest the closest library font so a
 * click-to-match replacement blends in. We match on genre (serif / mono / sans)
 * and a few well-known names; exact glyph-metric matching isn't possible across
 * different fonts, so this picks the nearest look-alike from our set.
 */
export function suggestLibraryFont(pdfFamily: string): PdfFontOption {
  const n = pdfFamily.toLowerCase();
  const pick = (family: string) =>
    PDF_FONT_OPTIONS.find((o) => o.family === family) ?? PDF_FONT_OPTIONS[0];

  // Direct well-known mappings first (closest visual match in our library).
  if (/times|georgia|garamond|minion|serif/.test(n)) {
    if (/garamond/.test(n)) return pick("EB Garamond");
    if (/georgia/.test(n)) return pick("Lora");
    return pick("Source Serif 4"); // Times-like transitional serif
  }
  if (/courier|mono|consol/.test(n)) return pick("Space Mono");
  if (/playfair|didot|bodoni/.test(n)) return pick("Playfair Display");
  if (/baskerville/.test(n)) return pick("Libre Baskerville");
  if (/merriweather/.test(n)) return pick("Merriweather");

  // Sans families → the closest sans in our set.
  if (/arial|helvet|roboto|liberation|nimbus\s*sans/.test(n)) return pick("Inter");
  if (/calibri|segoe|verdana|tahoma|open\s*sans/.test(n)) return pick("Open Sans");
  if (/montserrat|futura|poppins|geometr/.test(n)) return pick("Montserrat");
  if (/lato/.test(n)) return pick("Lato");

  // Generic serif vs sans fallback by keyword.
  if (/serif/.test(n)) return pick("Source Serif 4");
  return pick("Inter");
}

/** The filename for a family+weight, if we vendored it. */
function fileFor(family: string, weight: number): string | undefined {
  return (
    MANIFEST[`${family}::${weight}`] ??
    // Fall back to any weight of this family.
    Object.entries(MANIFEST).find(([k]) => k.startsWith(`${family}::`))?.[1]
  );
}

// Cache fetched font bytes so re-exporting doesn't refetch.
const byteCache = new Map<string, ArrayBuffer>();

/**
 * Fetch (and cache) the WOFF bytes for a family+weight, for pdf-lib embedding.
 * Returns null if we don't have that font vendored (caller falls back to a
 * standard PDF font).
 */
export async function loadFontBytes(
  family: string,
  weight: number,
): Promise<ArrayBuffer | null> {
  const file = fileFor(family, weight);
  if (!file) return null;
  const cached = byteCache.get(file);
  if (cached) return cached;
  try {
    const res = await fetch(`${BASE}fonts/${file}`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    byteCache.set(file, buf);
    return buf;
  } catch {
    return null;
  }
}
