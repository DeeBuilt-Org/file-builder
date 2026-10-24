import { useEffect, useRef, useState } from "react";
import {
  Button,
  Divider,
  Empty,
  Input,
  Segmented,
  Select,
  Space,
  Typography,
  ColorPicker,
  Slider,
  message,
} from "antd";
import {
  EditOutlined,
  FontSizeOutlined,
  HighlightOutlined,
  CalendarOutlined,
  CheckOutlined,
  SignatureOutlined,
  DownloadOutlined,
  ClearOutlined,
} from "@ant-design/icons";
import type { ModeSurfaceProps } from "@/lib/modes";
import { PanelHeader } from "@/components/shell/PanelHeader";
import { DropZone } from "@/components/shell/DropZone";
import {
  applyOverlay,
  type TextStamp,
  type ImageStamp,
  type RectStamp,
  type CheckStamp,
  type CircleStamp,
} from "@/lib/pdf-ops";
import { downloadBlob } from "@/lib/download";
import {
  PDF_FONT_OPTIONS,
  getFontOption,
  loadFontForPreview,
  loadFontBytes,
  suggestLibraryFont,
} from "@/lib/pdf-fonts";
import { useSignFill, RENDER_SCALE, type ElementKind } from "./SignFillContext";
import { OverlayBox } from "./OverlayBox";
import { SignaturePad } from "./SignaturePad";
import { MarkSvg } from "./MarkSvg";
import { DefaultSizes } from "./DefaultSizes";
import { ElementActions } from "./ElementActions";
import {
  MARK_SIZE_MAX,
  MARK_SIZE_MIN,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  circleBox,
  textBaselineFromBoxTop,
  textBoxHeight,
} from "./sizing";
import "./signfill.css";

const SIGNFILL_ACCENT = "#7c3aed";

/** Display scale for the on-screen page. Pages are rendered at RENDER_SCALE
 *  internally; we show them at this fraction so a full page fits comfortably. */
const DISPLAY_SCALE = 1;

function todayStr() {
  // Locale-friendly, no time. Uses the browser's locale.
  return new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* ------------------------------------------------------------------ Canvas */

export function SignFillCanvas({ isDark }: ModeSurfaceProps) {
  const {
    hasDoc,
    pages,
    loading,
    loadPdf,
    elements,
    selectedId,
    setSelectedId,
    duplicateElement,
    fixMode,
    matchTextItem,
  } = useSignFill();

  // Ctrl/Cmd+D duplicates the selected element. Ignored while typing in a field
  // so it never fires mid-edit.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "d") return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      duplicateElement(selectedId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, duplicateElement]);

  const onFiles = async (files: File[]) => {
    const ok = await loadPdf(files[0]);
    if (!ok) message.error("That doesn't look like a PDF I can open.");
  };

  if (!hasDoc) {
    return (
      <DropZone
        title="Drop a PDF to sign or fill"
        blurb="Add a signature, type text, drop a date or checkmark, or cover-and-replace something. Your PDF never leaves your browser — no account, no upload."
        accepts={["PDF"]}
        accept="application/pdf,.pdf"
        multiple={false}
        onFiles={onFiles}
        buttonLabel="Select a PDF"
      />
    );
  }

  return (
    <div className="fb-sf" data-dark={isDark} data-fixmode={fixMode}>
      {loading && (
        <Typography.Text type="secondary" className="fb-sf-loading">
          Rendering pages…
        </Typography.Text>
      )}
      {fixMode && (
        <Typography.Text className="fb-sf-fixhint">
          Click any line of text to cover and replace it — the font is matched for you.
        </Typography.Text>
      )}
      <div className="fb-sf-pages" onClick={() => setSelectedId(null)}>
        {pages.map((pg) => {
          const scale = DISPLAY_SCALE;
          return (
            <div
              key={pg.pageIndex}
              className="fb-sf-page"
              style={{ width: pg.width * scale, height: pg.height * scale }}
            >
              <img
                className="fb-sf-page-img"
                src={pg.url}
                alt={`Page ${pg.pageIndex + 1}`}
                draggable={false}
              />

              {/* Click-to-match layer: invisible hit boxes over existing text.
                  Only interactive in "fix text" mode so it never blocks normal
                  placing/dragging. */}
              {fixMode &&
                pg.textItems.map((item, i) => {
                  const family = pg.fontMap[item.fontName] ?? "";
                  const suggestion = suggestLibraryFont(family);
                  return (
                    <button
                      key={`t-${pg.pageIndex}-${i}`}
                      type="button"
                      className="fb-sf-hit"
                      style={{
                        left: item.x * scale,
                        top: item.y * scale,
                        width: item.width * scale,
                        height: item.height * scale,
                      }}
                      title={`Fix: ${item.str}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        loadFontForPreview(suggestion.family);
                        matchTextItem(
                          pg.pageIndex,
                          item,
                          { fontFamily: suggestion.family, fontWeight: suggestion.weight },
                          { r: 0, g: 0, b: 0 },
                        );
                      }}
                    />
                  );
                })}

              {/* Overlay layer for THIS page. */}
              {elements
                .filter((el) => el.pageIndex === pg.pageIndex)
                .map((el) => (
                  <OverlayBox key={el.id} el={el} scale={scale} />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Panel */

export function SignFillPanel({ isDark }: ModeSurfaceProps) {
  const {
    hasDoc,
    bytes,
    fileName,
    pages,
    elements,
    addElement,
    updateElement,
    defaults,
    selectedId,
    reset,
    fixMode,
    setFixMode,
  } = useSignFill();
  const [busy, setBusy] = useState(false);
  const [padOpen, setPadOpen] = useState(false);
  // Which page new elements land on. Defaults to the first page; a simple
  // page picker lets you target others without scrolling-detection complexity.
  const [targetPage, setTargetPage] = useState(0);
  const imgRef = useRef<HTMLInputElement>(null);

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  const place = (kind: ElementKind, extra: Partial<Parameters<typeof addElement>[0]>) => {
    const pg = pages[targetPage] ?? pages[0];
    if (!pg) return;
    // Drop it a bit in from the top-left so it's visible, not pinned to a corner.
    addElement({
      kind,
      pageIndex: pg.pageIndex,
      x: pg.width * 0.15,
      y: pg.height * 0.15,
      width: extra.width ?? 160,
      height: extra.height ?? 40,
      ...extra,
    });
  };

  // Every new element starts at the document's default sizes (see DefaultSizes),
  // so nothing has to be resized down after it's placed.
  const addText = () =>
    place("text", { text: "Type here", fontSize: defaults.textSize, color: { r: 0, g: 0, b: 0 }, fontFamily: "Inter", fontWeight: 400, width: 160, height: textBoxHeight(defaults.textSize) });

  const addDate = () =>
    place("text", { text: todayStr(), fontSize: defaults.textSize, color: { r: 0, g: 0, b: 0 }, fontFamily: "Inter", fontWeight: 400, width: 140, height: textBoxHeight(defaults.textSize) });

  const addCheck = () =>
    place("checkmark", { color: { r: 0, g: 0.4, b: 0.1 }, width: defaults.markSize, height: defaults.markSize });

  const addCircle = () =>
    place("circle", { color: { r: 0, g: 0.4, b: 0.1 }, ...circleBox(defaults.markSize) });

  // "Cover & fix" is just a text box that starts with a white background, so it
  // hides whatever's underneath while you type the correction on top — the way
  // DocHub does it, one element instead of two you have to align.
  const addCover = () =>
    place("text", {
      text: "",
      fontSize: defaults.textSize,
      color: { r: 0, g: 0, b: 0 },
      fontFamily: "Inter",
      fontWeight: 400,
      bg: { r: 1, g: 1, b: 1 },
      width: 140,
      height: textBoxHeight(defaults.textSize),
    });

  const onSignatureImage = (dataUrl: string, format: "png" | "jpg") => {
    const pg = pages[targetPage] ?? pages[0];
    if (!pg) return;
    // Default signature box ~ 200pt wide, keep a signature-ish aspect.
    addElement({
      kind: "signature",
      pageIndex: pg.pageIndex,
      x: pg.width * 0.15,
      y: pg.height * 0.7,
      width: 200,
      height: 80,
      imgDataUrl: dataUrl,
      imgFormat: format,
    });
  };

  const onUploadImage = async (file: File) => {
    const isPng = /png$/i.test(file.type) || /\.png$/i.test(file.name);
    const isJpg = /jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name);
    if (!isPng && !isJpg) {
      message.error("Use a PNG or JPG image for the signature.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    onSignatureImage(dataUrl, isPng ? "png" : "jpg");
  };

  const download = async () => {
    if (!bytes) return;
    setBusy(true);
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    try {
      const texts: TextStamp[] = [];
      const images: ImageStamp[] = [];
      const rects: RectStamp[] = [];
      const checks: CheckStamp[] = [];
      const circles: CircleStamp[] = [];
      for (const el of elements) {
        if (el.kind === "signature" && el.imgDataUrl) {
          const b = await (await fetch(el.imgDataUrl)).arrayBuffer();
          images.push({
            pageIndex: el.pageIndex,
            bytes: b,
            format: el.imgFormat ?? "png",
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
          });
        } else if (el.kind === "checkmark" || el.kind === "circle") {
          // Drawn as vectors from the same shapes the overlay shows (marks.ts).
          (el.kind === "checkmark" ? checks : circles).push({
            pageIndex: el.pageIndex,
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            color: el.color,
          });
        } else if (el.kind === "text") {
          // A background fill on a text box becomes a rect drawn first (the
          // cover), then the text on top — that's the cover-and-replace flow.
          if (el.bg) {
            rects.push({
              pageIndex: el.pageIndex,
              x: el.x,
              y: el.y,
              width: el.width,
              height: el.height,
              color: el.bg,
            });
          }
          if (el.text) {
            const size = el.fontSize ?? 16;
            const stamp: TextStamp = {
              pageIndex: el.pageIndex,
              text: el.text,
              x: el.x,
              y: el.y,
              size,
              // The overlay centers the line in its box; measure where that puts
              // the baseline so the PDF text lands on the same line.
              baseline: textBaselineFromBoxTop({
                boxHeight: el.height,
                fontSize: size,
                fontCss: el.fontFamily
                  ? getFontOption(el.fontFamily).css
                  : "Helvetica, Arial, sans-serif",
                fontWeight: el.fontWeight ?? 400,
              }),
              color: el.color,
            };
            // Embed the chosen library font's real bytes so the PDF matches the
            // on-screen preview. Fall back to the base font only if we somehow
            // can't load the bytes.
            if (el.fontFamily) {
              const opt = getFontOption(el.fontFamily);
              const bytes = await loadFontBytes(opt.family, el.fontWeight ?? opt.weight);
              if (bytes) {
                stamp.customFont = { key: `${opt.family}:${el.fontWeight ?? opt.weight}`, bytes };
              }
            }
            texts.push(stamp);
          }
        }
      }
      const out = await applyOverlay(bytes, { rects, images, texts, checks, circles });
      const base = (fileName ?? "document").replace(/\.pdf$/i, "");
      downloadBlob(new Blob([out.slice()], { type: "application/pdf" }), `${base}-signed.pdf`);
      message.success("PDF ready");
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      message.error(`Couldn't build the PDF — ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-dark={isDark}>
      <PanelHeader icon={<EditOutlined />} title="Sign & Fill" accent={SIGNFILL_ACCENT} />

      {!hasDoc ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Drop a PDF to get started"
          style={{ marginTop: 24 }}
        />
      ) : (
        <>
          {pages.length > 1 && (
            <div className="fb-field">
              <label className="fb-field-label">Add to page</label>
              <Segmented
                options={pages.map((p) => ({ label: String(p.pageIndex + 1), value: p.pageIndex }))}
                value={targetPage}
                onChange={(v) => setTargetPage(Number(v))}
                size="small"
              />
            </div>
          )}

          <Button
            block
            type={fixMode ? "primary" : "default"}
            icon={<HighlightOutlined />}
            onClick={() => setFixMode(!fixMode)}
            style={{ marginBottom: 6 }}
          >
            {fixMode ? "Click text on the page…" : "Fix existing text"}
          </Button>
          <Typography.Text type="secondary" className="fb-text-micro" style={{ display: "block", marginBottom: 14 }}>
            Click a line to cover &amp; replace it with a matched font.
          </Typography.Text>

          <label className="fb-field-label" style={{ marginTop: 4 }}>
            Add to the page
          </label>
          <div className="fb-sf-tools">
            <button type="button" className="fb-sf-tool" onClick={addText}>
              <FontSizeOutlined />
              <span>Text</span>
            </button>
            <button type="button" className="fb-sf-tool" onClick={() => setPadOpen(true)}>
              <SignatureOutlined />
              <span>Signature</span>
            </button>
            <button type="button" className="fb-sf-tool" onClick={addDate}>
              <CalendarOutlined />
              <span>Date</span>
            </button>
            <button type="button" className="fb-sf-tool" onClick={addCheck}>
              <CheckOutlined />
              <span>Check</span>
            </button>
            <button type="button" className="fb-sf-tool" onClick={addCircle}>
              <MarkSvg kind="circle" width={26} height={20} color="currentColor" scale={1.3} />
              <span>Circle</span>
            </button>
            <button type="button" className="fb-sf-tool" onClick={addCover}>
              <HighlightOutlined />
              <span>Cover &amp; fix</span>
            </button>
            <button type="button" className="fb-sf-tool" onClick={() => imgRef.current?.click()}>
              <SignatureOutlined />
              <span>Upload sig</span>
            </button>
          </div>
          <input
            ref={imgRef}
            type="file"
            accept="image/png,image/jpeg"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.[0]) void onUploadImage(e.target.files[0]);
              e.target.value = "";
            }}
          />

          <DefaultSizes />

          {/* Selected-element editor */}
          {selected && selected.kind === "text" && (
            <>
              <Divider style={{ margin: "16px 0" }} />
              <div className="fb-field">
                <label className="fb-field-label">Edit text</label>
                <Input.TextArea
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  value={selected.text}
                  onChange={(e) => updateElement(selected.id, { text: e.target.value })}
                  placeholder="Type…"
                />
              </div>
              <div className="fb-field">
                <label className="fb-field-label">Font</label>
                <Select
                  showSearch
                  value={selected.fontFamily ?? "Inter"}
                  onChange={(v) => {
                    const opt = getFontOption(v);
                    loadFontForPreview(v);
                    updateElement(selected.id, { fontFamily: v, fontWeight: opt.weight });
                  }}
                  optionFilterProp="label"
                  listHeight={320}
                  options={PDF_FONT_OPTIONS.map((o) => ({
                    value: o.family,
                    label: o.family,
                  }))}
                  // Render each option in its own font so the list is a live
                  // type specimen — mount-load the font as it renders.
                  optionRender={(opt) => {
                    loadFontForPreview(String(opt.value));
                    return (
                      <span className="fb-text-body" style={{ fontFamily: getFontOption(String(opt.value)).css }}>
                        {opt.label}
                      </span>
                    );
                  }}
                  style={{ width: "100%" }}
                />
              </div>

              <div className="fb-sf-textopts">
                <div>
                  <label className="fb-field-label">Size</label>
                  <Slider
                    min={TEXT_SIZE_MIN}
                    max={TEXT_SIZE_MAX}
                    value={selected.fontSize ?? 16}
                    onChange={(v) => updateElement(selected.id, { fontSize: v, height: textBoxHeight(v) })}
                  />
                </div>
                <div className="fb-sf-color">
                  <label className="fb-field-label">Text</label>
                  <ColorPicker
                    value={
                      selected.color
                        ? `rgb(${selected.color.r * 255},${selected.color.g * 255},${selected.color.b * 255})`
                        : "#000000"
                    }
                    onChange={(c) => {
                      const { r, g, b } = c.toRgb();
                      updateElement(selected.id, { color: { r: r / 255, g: g / 255, b: b / 255 } });
                    }}
                  />
                </div>
              </div>

              <div className="fb-field" style={{ marginTop: 8 }}>
                <label className="fb-field-label">Background</label>
                <div className="fb-sf-bgrow">
                  <Segmented
                    size="small"
                    value={selected.bg ? "fill" : "none"}
                    onChange={(v) =>
                      updateElement(selected.id, {
                        bg: v === "fill" ? (selected.bg ?? { r: 1, g: 1, b: 1 }) : undefined,
                      })
                    }
                    options={[
                      { label: "None", value: "none" },
                      { label: "Fill", value: "fill" },
                    ]}
                  />
                  {selected.bg && (
                    <ColorPicker
                      value={`rgb(${selected.bg.r * 255},${selected.bg.g * 255},${selected.bg.b * 255})`}
                      onChange={(c) => {
                        const { r, g, b } = c.toRgb();
                        updateElement(selected.id, { bg: { r: r / 255, g: g / 255, b: b / 255 } });
                      }}
                    />
                  )}
                  <Typography.Text type="secondary" className="fb-text-micro">
                    Fill covers what's underneath
                  </Typography.Text>
                </div>
              </div>

              <ElementActions id={selected.id} />
            </>
          )}

          {selected && (selected.kind === "checkmark" || selected.kind === "circle") && (
            <>
              <Divider style={{ margin: "16px 0" }} />
              <div className="fb-sf-textopts">
                <div>
                  {selected.kind === "checkmark" ? (
                    <>
                      <label className="fb-field-label">Size</label>
                      <Slider
                        min={MARK_SIZE_MIN}
                        max={MARK_SIZE_MAX}
                        value={Math.round(selected.height)}
                        onChange={(v) => updateElement(selected.id, { width: v, height: v })}
                      />
                    </>
                  ) : (
                    <Typography.Text type="secondary" className="fb-text-caption">
                      Drag the corner to fit the circle around a word.
                    </Typography.Text>
                  )}
                </div>
                <div className="fb-sf-color">
                  <label className="fb-field-label">Color</label>
                  <ColorPicker
                    value={
                      selected.color
                        ? `rgb(${selected.color.r * 255},${selected.color.g * 255},${selected.color.b * 255})`
                        : "#000000"
                    }
                    onChange={(c) => {
                      const { r, g, b } = c.toRgb();
                      updateElement(selected.id, { color: { r: r / 255, g: g / 255, b: b / 255 } });
                    }}
                  />
                </div>
              </div>
              <ElementActions id={selected.id} />
            </>
          )}

          {selected && selected.kind === "signature" && (
            <>
              <Divider style={{ margin: "16px 0" }} />
              <Typography.Text type="secondary" className="fb-text-caption">
                Drag to position, grab the corner to resize.
              </Typography.Text>
              <div>
                <ElementActions id={selected.id} />
              </div>
            </>
          )}

          <Divider style={{ margin: "18px 0" }} />

          <div className="fb-summary">
            <div className="fb-summary-row">
              <Typography.Text type="secondary">Pages</Typography.Text>
              <Typography.Text strong>{pages.length}</Typography.Text>
            </div>
            <div className="fb-summary-row">
              <Typography.Text type="secondary">Placed items</Typography.Text>
              <Typography.Text strong>{elements.length}</Typography.Text>
            </div>
          </div>

          <Space direction="vertical" size={10} style={{ width: "100%", marginTop: 18 }}>
            <Button
              type="primary"
              size="large"
              icon={<DownloadOutlined />}
              block
              loading={busy}
              onClick={download}
            >
              Download PDF
            </Button>
            <Button icon={<ClearOutlined />} block danger onClick={reset} disabled={busy}>
              Start over
            </Button>
            <Typography.Text
              type="secondary"
              className="fb-text-fine"
              style={{ textAlign: "center", display: "block" }}
            >
              Edited in your browser — your PDF is never uploaded.
            </Typography.Text>
          </Space>

          <SignaturePad
            open={padOpen}
            onClose={() => setPadOpen(false)}
            onDone={(dataUrl) => {
              onSignatureImage(dataUrl, "png");
              setPadOpen(false);
            }}
          />
        </>
      )}
    </div>
  );
}
