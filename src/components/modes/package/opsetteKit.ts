/**
 * "Load a brand kit" quick-fill.
 *
 * Brand Board saves a single `.brand-kit.json` (older saves: `.opsette-kit.json`;
 * same contents) "project file" that carries every generated asset inline
 * as a data URL — the logo, the QR code, the digital card, the email-signature
 * HTML, and a set of social assets (banners, icons, favicon). This module
 * decodes that one file into a list of real `File` objects with sensible names
 * and folders, so the bundler's generic file list can be pre-filled in one click
 * instead of exporting and importing every asset by hand.
 *
 * This is an ACCELERANT layered on top of the agnostic bundler — it just seeds
 * the same editable rows `addFiles` produces. It introduces NO fixed slots and
 * NO kit-only framing; every row it creates is a normal, renamable, movable,
 * removable bundle row like any dropped file.
 *
 * Robustness rule: this must NEVER throw on junk. A wrong/corrupt file returns
 * an empty result with a friendly reason, so the caller can show a gentle
 * "that's not a brand kit file" message instead of crashing.
 *
 * Self-inclusion: Brand Board now bakes its OWN designed pages into the blob too
 * — each page as a numbered PNG (pageRenders) plus the whole board as one
 * flippable PDF (pagesPdf) — so they ride inside the one kit file and this
 * quick-fill routes them to a Brand_Board/ folder like everything else. The
 * palette PNG/PDF also ride in the blob (paletteImageDataUrl/palettePdfDataUrl).
 * Any remaining hand-authored PDFs (e.g. a separate Font_Pairing.pdf) can still
 * be dragged in manually, but the core kit is now fully blob-carried.
 */

/* ------------------------------------------------------------ data-url decode */

/** Decode a `data:...;base64,...` URL into a File, or null if it isn't one. */
function dataUrlToFile(dataUrl: unknown, fileName: string): File | null {
  if (typeof dataUrl !== "string") return null;
  // Per RFC 2397 a data URL is  data:[<mime>][;<param>...][;base64],<payload>.
  // The whole meta section (mime + any params like `;charset=utf-8`) can carry
  // extra `;`-separated parameters, so we grab everything up to the FIRST comma
  // and pull the mime + base64 flag out of it. (The old regex only allowed a
  // bare mime then an optional `;base64`, so a raw SVG QR carried as
  // `data:image/svg+xml;charset=utf-8,...` failed to match and was dropped.)
  const match = /^data:([^,]*?),(.*)$/s.exec(dataUrl.trim());
  if (!match) return null;
  const meta = match[1] ?? "";
  const mime = meta.split(";")[0] || "application/octet-stream";
  const isBase64 = /;base64/i.test(meta);
  const payload = match[2] ?? "";
  try {
    let buffer: ArrayBuffer;
    if (isBase64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      buffer = bytes.buffer;
    } else {
      const decoded = decodeURIComponent(payload);
      buffer = new TextEncoder().encode(decoded).buffer;
    }
    return new File([buffer], fileName, { type: mime });
  } catch {
    return null;
  }
}

/** Wrap a UTF-8 string (e.g. signature HTML) as a File. */
function textToFile(text: unknown, fileName: string, mime: string): File | null {
  if (typeof text !== "string" || !text.trim()) return null;
  return new File([text], fileName, { type: mime });
}

/**
 * Rasterize an SVG data URL to a PNG File so a non-technical client always has a
 * "drops into anything" copy alongside the scalable vector master. The QR is
 * exported as SVG (sharp at any print size — business cards, Vistaprint, signage)
 * but plain Word/email/slides won't place an SVG, so we ship BOTH. Browser-only
 * (uses <canvas>); returns null on any failure so a bad/absent SVG never blocks
 * the rest of the kit from loading.
 */
async function svgDataUrlToPng(
  dataUrl: unknown,
  fileName: string,
  size = 1024,
): Promise<File | null> {
  if (typeof dataUrl !== "string" || !/^data:image\/svg\+xml/i.test(dataUrl)) return null;
  if (typeof document === "undefined") return null;
  try {
    const img = new Image();
    img.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg decode failed"));
    });
    img.src = dataUrl;
    await loaded;
    const canvas = document.createElement("canvas");
    // Square QR; fall back to the requested size if the SVG has no intrinsic box.
    const w = img.naturalWidth || size;
    const h = img.naturalHeight || size;
    const scale = Math.max(1, size / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // White backing so a transparent SVG doesn't render black-on-black in viewers
    // that composite onto a dark surface. A QR needs an opaque quiet zone anyway.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) return null;
    return new File([blob], fileName, { type: "image/png" });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------ naming helpers */

/** Filesystem-safe stem from an arbitrary string, or a fallback. */
function slugify(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const s = raw
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || fallback;
}

/** Pick a file extension for an image data URL by its MIME (defaults png). */
function imageExt(dataUrl: unknown): string {
  if (typeof dataUrl === "string") {
    const m = /^data:image\/([a-z0-9+]+)/i.exec(dataUrl);
    if (m) {
      const t = m[1].toLowerCase();
      if (t === "jpeg") return "jpg";
      if (t === "svg+xml") return "svg";
      return t;
    }
  }
  return "png";
}

/* ------------------------------------------------------ folder constants */
// Match the delivery structure in FIVERR-BUSINESS-STARTER-KIT.md.
const F_LOGO = "Logo";
const F_SIGNATURE = "Email_Signature";
const F_CARD = "Digital_Card";
const F_SOCIAL = "Social_Banner";
const F_ICONS = "Icons";
const F_PALETTE = "Color_Palette";
const F_BRAND_BOARD = "Brand_Board";
const F_QR = "QR_Code";

// Brand Board's own designed pages, baked into the kit as PNGs keyed by page id
// (self-inclusion). Numbered so they sort in order in the client's folder,
// directly fixing the "can't hit Next / files out of order" pain. Any page id
// not listed here still routes (falls back to a plain numbered name).
const BOARD_PAGE_ORDER: { key: string; name: string }[] = [
  { key: "foundation", name: "01_Foundation.png" },
  { key: "applications", name: "02_Applications.png" },
  { key: "social", name: "03_Social.png" },
  { key: "guide", name: "04_Guide.png" },
];

/* ------------------------------------------------------ social routing */

interface SocialAsset {
  label?: unknown;
  kind?: unknown;
  image?: unknown;
  width?: unknown;
  height?: unknown;
}

/** Route a social asset to a (folder, filename) by its kind. */
function socialTarget(asset: SocialAsset, index: number): { folder: string; stem: string } {
  const kind = typeof asset.kind === "string" ? asset.kind.toLowerCase() : "";
  const label = typeof asset.label === "string" ? asset.label : "";
  const stem = slugify(label, `social_${index + 1}`);
  switch (kind) {
    case "banner":
    case "card":
      return { folder: F_SOCIAL, stem };
    case "icon":
    case "favicon":
      return { folder: F_ICONS, stem };
    default:
      return { folder: F_SOCIAL, stem };
  }
}

/* ------------------------------------------------------ the prepared row shape */

export interface PreparedFile {
  file: File;
  /** Default output name inside the zip (with extension). User can rename. */
  name: string;
  /** Default folder (may be ""). User can change. */
  folder: string;
}

export interface KitParseResult {
  files: PreparedFile[];
  /** A short label for the kit (brand/kit/business name), if we found one. */
  kitLabel: string | null;
  /** null on success; a friendly reason when we couldn't read a kit. */
  error: string | null;
}

const EMPTY_FAIL = (error: string): KitParseResult => ({ files: [], kitLabel: null, error });

/**
 * Parse the raw text of a `.brand-kit.json` file into prepared bundle files.
 * Tolerant of both the enveloped shape ({ type, v, board:{...} }) and a bare
 * board object. Never throws.
 */
export async function parseOpsetteKit(rawText: string): Promise<KitParseResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return EMPTY_FAIL("That file isn't valid JSON, so it can't be a brand kit.");
  }
  if (!parsed || typeof parsed !== "object") {
    return EMPTY_FAIL("That doesn't look like a brand kit file.");
  }

  const root = parsed as Record<string, unknown>;
  // Enveloped ({ type, v, board }) or a bare board object — accept both.
  const board = (
    root.board && typeof root.board === "object" ? root.board : root
  ) as Record<string, unknown>;

  const kitLabel =
    (typeof board.kitName === "string" && board.kitName.trim()) ||
    (typeof board.businessName === "string" && board.businessName.trim()) ||
    null;
  const brandStem = slugify(kitLabel, "brand");

  const files: PreparedFile[] = [];
  const push = (file: File | null, name: string, folder: string) => {
    if (file) files.push({ file, name, folder });
  };

  // Logo.
  push(
    dataUrlToFile(board.logoDataUrl, `${brandStem}_logo.${imageExt(board.logoDataUrl)}`),
    `${brandStem}_logo.${imageExt(board.logoDataUrl)}`,
    F_LOGO,
  );

  // Color palette — the rendered swatch sheet (PNG) and the copyable-hex PDF that
  // Palette Studio bakes into its blob and Brand Board carries through. Both land
  // in a Color_Palette folder. dataUrlToFile reads the MIME, so it wraps the PDF
  // (application/pdf) just as cleanly as the PNG.
  push(
    dataUrlToFile(board.paletteImageDataUrl, `${brandStem}_palette.${imageExt(board.paletteImageDataUrl)}`),
    `${brandStem}_palette.${imageExt(board.paletteImageDataUrl)}`,
    F_PALETTE,
  );
  push(
    dataUrlToFile(board.palettePdfDataUrl, `${brandStem}_palette.pdf`),
    `${brandStem}_palette.pdf`,
    F_PALETTE,
  );

  // QR code — its own QR_Code folder, like every other asset family. Brand Board
  // / QR Creator export it as a scalable SVG (sharp at any print size). We ship
  // BOTH the SVG master and a rasterized PNG so a non-technical client can drop
  // the PNG into email/Word/slides while a printer or designer uses the vector.
  const qrExt = imageExt(board.qrDataUrl); // "svg" for the SVG QR
  push(
    dataUrlToFile(board.qrDataUrl, `qr_code.${qrExt}`),
    `qr_code.${qrExt}`,
    F_QR,
  );
  if (qrExt === "svg") {
    push(await svgDataUrlToPng(board.qrDataUrl, "qr_code.png"), "qr_code.png", F_QR);
  }

  // Digital card — the visual PNG plus, when present, the vCard (.vcf) the
  // client saves to their own phone contacts. dataUrlToFile reads the MIME, so
  // it wraps text/vcard as cleanly as an image. `cardVcardDataUrl` is baked by
  // Digital Card and carried through Brand Board (see BRAND-KIT-INTEROP-CONTRACT).
  push(
    dataUrlToFile(board.cardDataUrl, `digital_card.${imageExt(board.cardDataUrl)}`),
    `digital_card.${imageExt(board.cardDataUrl)}`,
    F_CARD,
  );
  push(
    dataUrlToFile(board.cardVcardDataUrl, `${brandStem}_contact.vcf`),
    `${brandStem}_contact.vcf`,
    F_CARD,
  );
  // The vCard QR (data.qr) — the tap-to-save half: scan → the phone offers to
  // save the contact. Baked by Digital Card (§2a), carried through Brand Board
  // as cardQrDataUrl. Null on kits built before the QR bake, so push() no-ops.
  push(
    dataUrlToFile(board.cardQrDataUrl, `contact_qr.${imageExt(board.cardQrDataUrl)}`),
    `contact_qr.${imageExt(board.cardQrDataUrl)}`,
    F_CARD,
  );

  // Email signature HTML.
  push(textToFile(board.signatureHtml, "signature.html", "text/html"), "signature.html", F_SIGNATURE);

  // Social assets (banners / icons / favicon / card).
  if (Array.isArray(board.socialAssets)) {
    const usedNames = new Map<string, number>();
    board.socialAssets.forEach((raw, i) => {
      if (!raw || typeof raw !== "object") return;
      const asset = raw as SocialAsset;
      const ext = imageExt(asset.image);
      const { folder, stem } = socialTarget(asset, i);
      // Keep names unique within the run so two "banner"s don't collide before
      // the zip builder's own de-collision even runs.
      const key = `${folder}/${stem}`;
      const seen = usedNames.get(key) ?? 0;
      usedNames.set(key, seen + 1);
      const name = seen === 0 ? `${stem}.${ext}` : `${stem}_${seen + 1}.${ext}`;
      push(dataUrlToFile(asset.image, name), name, folder);
    });
  }

  // Banner Designer's banners — a separate board slot from socialAssets (so Icon
  // Kit and Banner Designer don't overwrite each other), but the same asset shape.
  // They're social banners, so they route to the Social_Banner folder like Icon
  // Kit's banners. Same de-collision within the run.
  if (Array.isArray(board.bannerAssets)) {
    const usedNames = new Map<string, number>();
    board.bannerAssets.forEach((raw, i) => {
      if (!raw || typeof raw !== "object") return;
      const asset = raw as SocialAsset;
      const ext = imageExt(asset.image);
      const label = typeof asset.label === "string" ? asset.label : "";
      const stem = slugify(label, `banner_${i + 1}`);
      const key = `${F_SOCIAL}/${stem}`;
      const seen = usedNames.get(key) ?? 0;
      usedNames.set(key, seen + 1);
      const name = seen === 0 ? `${stem}.${ext}` : `${stem}_${seen + 1}.${ext}`;
      push(dataUrlToFile(asset.image, name), name, F_SOCIAL);
    });
  }

  // Brand Board's OWN designed pages (self-inclusion) — the frozen PNG of each
  // present page, baked into the kit at Save. These are the deliverable the kit
  // was always meant to carry; before self-inclusion they fell out as loose
  // downloads. Route the known pages in canonical numbered order, then sweep any
  // extra/unknown page ids so a future page still lands somewhere sensible.
  if (board.pageRenders && typeof board.pageRenders === "object") {
    const renders = board.pageRenders as Record<string, unknown>;
    const routed = new Set<string>();
    BOARD_PAGE_ORDER.forEach(({ key, name }) => {
      if (renders[key] == null) return;
      routed.add(key);
      push(dataUrlToFile(renders[key], name), name, F_BRAND_BOARD);
    });
    let extra = BOARD_PAGE_ORDER.length;
    Object.keys(renders).forEach((key) => {
      if (routed.has(key)) return;
      extra += 1;
      const name = `${String(extra).padStart(2, "0")}_${slugify(key, "page")}.png`;
      push(dataUrlToFile(renders[key], name), name, F_BRAND_BOARD);
    });
  }

  // The whole board as one flippable PDF — the single hand-off doc, baked in
  // alongside the page PNGs. (Previously a manual drag-in; now it rides in the
  // blob like everything else.)
  push(
    dataUrlToFile(board.pagesPdf, `${brandStem}_brand_board.pdf`),
    `${brandStem}_brand_board.pdf`,
    F_BRAND_BOARD,
  );

  if (files.length === 0) {
    return EMPTY_FAIL(
      "That's a valid file, but it has no kit assets to load. Try exporting the kit again from Brand Board.",
    );
  }

  return { files, kitLabel: kitLabel || null, error: null };
}
