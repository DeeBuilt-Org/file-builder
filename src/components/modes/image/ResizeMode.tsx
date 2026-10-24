import { useMemo, useState } from "react";
import { Button, Divider, Empty, InputNumber, Segmented, Space, Switch, Tooltip, Typography, message } from "antd";
import { ExpandOutlined, DownloadOutlined, SwapOutlined } from "@ant-design/icons";
import type { ModeSurfaceProps } from "@/lib/modes";
import { PanelHeader } from "@/components/shell/PanelHeader";
import { ImageCanvas } from "./ImageCanvas";
import { ExactFillPreview } from "./ExactFillPreview";
import { useImageWork } from "./ImageWorkContext";
import { deliverImages } from "./imageOutput";
import { canPickSaveLocation } from "@/lib/download";
import {
  resizeImage,
  renderExactSize,
  withExt,
  formatFor,
  resolveOutput,
  detectedLabel,
  fitDimensions,
  CENTER_FOCUS,
  RASTER_FORMATS,
  type FillFocus,
  type FillMode,
  type OutputFormat,
} from "@/lib/image-ops";
import "./image.css";

const RESIZE_ACCENT = "#2980b9";
const { Text } = Typography;

/**
 * Build the output-format tabs. The "keep" tab shows the DETECTED source format
 * (e.g. "PNG · keep") so the user sees exactly what they'll get, and the label
 * stays short enough to fit the tab. Falls back to a plain "Keep" before an image
 * is loaded.
 */
function formatOptions(sourceFile: File | undefined): { label: string; value: OutputFormat }[] {
  const detected = detectedLabel(sourceFile);
  return [
    { label: detected ? `${detected} · keep` : "Keep", value: "keep" },
    ...RASTER_FORMATS.map((f) => ({ label: f.label, value: f.mime as OutputFormat })),
  ];
}

/** Common target sizes — icon sizes plus a couple of general presets. */
const PRESETS = [
  { label: "32 px", value: 32 },
  { label: "192 px", value: 192 },
  { label: "512 px", value: 512 },
  { label: "1080 px", value: 1080 },
];

/**
 * Exact-size presets for the places that REJECT a submission over a few pixels —
 * the reason exact mode exists. Chrome Web Store listing assets lead, since a
 * store review bounces anything off-spec. Grouped by where they're used so the
 * chip row reads as a reference rather than a pile of numbers.
 */
const EXACT_PRESETS = [
  { group: "Chrome Web Store", sizes: [
    { w: 1280, h: 800 },
    { w: 640, h: 400 },
    { w: 440, h: 280 },
    { w: 1400, h: 560 },
  ] },
  { group: "Social & web", sizes: [
    { w: 1200, h: 630 },
    { w: 1080, h: 1080 },
  ] },
];

/** Pad colors — white first because it's what most submissions want. */
const PAD_COLORS = [
  { value: "#ffffff", label: "White" },
  { value: "#000000", label: "Black" },
  { value: "#f5f6f8", label: "Light grey" },
  { value: "transparent", label: "Transparent" },
];

type Mode = "longest" | "box" | "exact";

export function ResizeCanvas({ isDark }: ModeSurfaceProps) {
  return (
    <ImageCanvas
      isDark={isDark}
      blurb="Add one or more images, then scale them to a preset, fit them in a box, or force an exact pixel size."
      accepts={["PNG", "JPG", "WebP", "GIF", "SVG"]}
    />
  );
}

export function ResizePanel({ isDark }: ModeSurfaceProps) {
  const { items, hasImages } = useImageWork();
  const [mode, setMode] = useState<Mode>("longest");
  const [longest, setLongest] = useState<number>(512);
  const [boxW, setBoxW] = useState<number | null>(512);
  const [boxH, setBoxH] = useState<number | null>(512);
  const [exactW, setExactW] = useState<number>(640);
  const [exactH, setExactH] = useState<number>(400);
  const [fill, setFill] = useState<FillMode>("crop");
  const [focus, setFocus] = useState<FillFocus>(CENTER_FOCUS);
  const [padColor, setPadColor] = useState<string>("#ffffff");
  const [allowUpscale, setAllowUpscale] = useState(false);
  const [format, setFormat] = useState<OutputFormat>("keep");
  const [busy, setBusy] = useState(false);
  // Default ON where supported: the whole point of this mode is iterating toward a
  // spec, and picking the same file each pass overwrites instead of piling up
  // "shot (4).png" in Downloads.
  const pickerAvailable = useMemo(() => canPickSaveLocation(), []);
  const [pickLocation, setPickLocation] = useState(pickerAvailable);

  const first = items[0];

  // Preview the resulting dimensions for the first image so the user sees the
  // effect before committing (the same size math the actual resize uses). Exact
  // mode needs no estimate — the answer is the numbers you typed, by definition.
  const preview = useMemo(() => {
    if (!first || mode === "exact") return null;
    if (mode === "longest") {
      return fitDimensions(first.width, first.height, { maxW: longest, maxH: longest, allowUpscale });
    }
    return fitDimensions(first.width, first.height, {
      maxW: boxW ?? undefined,
      maxH: boxH ?? undefined,
      allowUpscale,
    });
  }, [first, mode, longest, boxW, boxH, allowUpscale]);

  // In exact mode the switch is meaningless: reaching a target the source is too
  // small for REQUIRES enlarging, so exact always upscales when it must.
  const upscaleApplies = mode !== "exact";

  const onDownload = async () => {
    if (!hasImages) return;
    setBusy(true);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    try {
      const out = [];
      for (const it of items) {
        const to = resolveOutput(format, it.file);
        const ext = formatFor(to).ext;
        const blob =
          mode === "exact"
            ? (
                await renderExactSize(it.file, {
                  width: exactW,
                  height: exactH,
                  fill,
                  focus,
                  background: fill === "pad" ? padColor : "transparent",
                  to,
                  quality: 0.92,
                })
              ).blob
            : (
                await resizeImage(it.file, {
                  ...(mode === "longest"
                    ? { maxW: longest, maxH: longest }
                    : { maxW: boxW ?? undefined, maxH: boxH ?? undefined }),
                  allowUpscale,
                  to,
                  quality: 0.92,
                })
              ).blob;
        out.push({ name: withExt(it.name, ext), blob });
      }
      const result = await deliverImages(out, "resized-images", {
        usePicker: pickLocation && pickerAvailable,
      });
      if (result.status === "cancelled") {
        message.info("Save cancelled — nothing was written.");
        return;
      }
      const sizeNote = mode === "exact" ? ` to ${exactW} × ${exactH}` : "";
      const where = result.status === "picked" ? ` Saved as ${result.fileName}.` : "";
      message.success(`Resized ${out.length} image${out.length === 1 ? "" : "s"}${sizeNote}.${where}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      message.error(`Couldn't resize — ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-dark={isDark}>
      <PanelHeader icon={<ExpandOutlined />} title="Resize images" accent={RESIZE_ACCENT} />

      {!hasImages ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Add images to resize"
          style={{ marginTop: 24 }}
        />
      ) : (
        <>
          <div className="fb-field">
            <label className="fb-field-label">Resize by</label>
            <Segmented
              block
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              options={[
                { label: "Longest side", value: "longest" },
                { label: "Fit in box", value: "box" },
                { label: "Exact size", value: "exact" },
              ]}
            />
          </div>

          {mode === "longest" && (
            <div className="fb-field">
              <label className="fb-field-label">Longest side (px)</label>
              <InputNumber
                min={1}
                max={8000}
                value={longest}
                onChange={(v) => setLongest(v ?? 1)}
                style={{ width: "100%" }}
              />
              <div className="fb-size-chips" style={{ marginTop: 8 }}>
                {PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className="fb-size-chip"
                    data-on={longest === p.value}
                    onClick={() => setLongest(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <Text type="secondary" className="fb-field-hint">
                Scales so the wider side hits this. Aspect ratio kept.
              </Text>
            </div>
          )}

          {mode === "box" && (
            <div className="fb-field">
              <label className="fb-field-label">Max width × height (px)</label>
              <Space.Compact style={{ width: "100%" }}>
                <InputNumber
                  min={1}
                  max={8000}
                  value={boxW}
                  onChange={setBoxW}
                  placeholder="width"
                  style={{ width: "50%" }}
                />
                <InputNumber
                  min={1}
                  max={8000}
                  value={boxH}
                  onChange={setBoxH}
                  placeholder="height"
                  style={{ width: "50%" }}
                />
              </Space.Compact>
              <Text type="secondary" className="fb-field-hint">
                The image fits inside this box, aspect ratio kept — so one side usually
                lands short of the number you typed. Use Exact size if you need both.
              </Text>
            </div>
          )}

          {mode === "exact" && (
            <>
              <div className="fb-field">
                <label className="fb-field-label">Exact width × height (px)</label>
                <Space.Compact style={{ width: "100%" }}>
                  <InputNumber
                    min={1}
                    max={8000}
                    value={exactW}
                    onChange={(v) => setExactW(v ?? 1)}
                    placeholder="width"
                    style={{ width: "50%" }}
                  />
                  <InputNumber
                    min={1}
                    max={8000}
                    value={exactH}
                    onChange={(v) => setExactH(v ?? 1)}
                    placeholder="height"
                    style={{ width: "50%" }}
                  />
                  <Tooltip title="Swap width and height">
                    <Button
                      icon={<SwapOutlined />}
                      onClick={() => {
                        setExactW(exactH);
                        setExactH(exactW);
                      }}
                    />
                  </Tooltip>
                </Space.Compact>
                {EXACT_PRESETS.map((g) => (
                  <div key={g.group} className="fb-size-chip-group">
                    <span className="fb-size-chip-label">{g.group}</span>
                    <div className="fb-size-chips">
                      {g.sizes.map((s) => (
                        <button
                          key={`${s.w}x${s.h}`}
                          type="button"
                          className="fb-size-chip"
                          data-on={exactW === s.w && exactH === s.h}
                          onClick={() => {
                            setExactW(s.w);
                            setExactH(s.h);
                          }}
                        >
                          {s.w}×{s.h}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <Text type="secondary" className="fb-field-hint">
                  Output is exactly these pixels, every time, whatever the source.
                </Text>
              </div>

              <div className="fb-field">
                <label className="fb-field-label">When the shape doesn't match</label>
                <Segmented
                  block
                  value={fill}
                  onChange={(v) => setFill(v as FillMode)}
                  options={[
                    { label: "Crop to fill", value: "crop" },
                    { label: "Pad to fit", value: "pad" },
                    { label: "Stretch", value: "stretch" },
                  ]}
                />
                <Text type="secondary" className="fb-field-hint">
                  {fill === "crop"
                    ? "Fills the whole frame, trimming the overflow. Drag the preview to choose what stays."
                    : fill === "pad"
                      ? "Keeps the entire image and fills the leftover space with your background color."
                      : "Squashes the image to the exact box. It will look distorted."}
                </Text>
              </div>

              {fill === "pad" && (
                <div className="fb-field">
                  <label className="fb-field-label">Background</label>
                  <div className="fb-exact-swatches">
                    {PAD_COLORS.map((c) => (
                      <Tooltip key={c.value} title={c.label}>
                        <button
                          type="button"
                          className="fb-exact-swatch"
                          data-on={padColor === c.value}
                          data-clear={c.value === "transparent" ? "true" : undefined}
                          style={c.value === "transparent" ? undefined : { background: c.value }}
                          onClick={() => setPadColor(c.value)}
                          aria-label={c.label}
                        />
                      </Tooltip>
                    ))}
                    <input
                      type="color"
                      className="fb-exact-swatch"
                      value={padColor === "transparent" ? "#ffffff" : padColor}
                      onChange={(e) => setPadColor(e.target.value)}
                      aria-label="Custom background color"
                    />
                  </div>
                  {padColor === "transparent" && (
                    <Text type="secondary" className="fb-field-hint">
                      Transparent needs PNG or WebP — a JPG has no transparency and will come
                      out white.
                    </Text>
                  )}
                </div>
              )}

              {first && (
                <div className="fb-field">
                  <label className="fb-field-label">Preview · {exactW} × {exactH}</label>
                  {/* Exact mode's own before→after line. Without this the only
                      dimensions on screen are the source thumbnails' ORIGINAL size,
                      which reads as "it didn't resize" until you re-upload the
                      output to check. Say the answer plainly instead. */}
                  <div className="fb-img-estimate" style={{ marginBottom: 10 }}>
                    <div className="fb-img-estimate-row">
                      <span className="fb-img-estimate-before">
                        {first.width} × {first.height}
                      </span>
                      <span className="fb-img-estimate-after">
                        {exactW} × {exactH}
                      </span>
                    </div>
                  </div>
                  <ExactFillPreview
                    src={first.previewUrl}
                    natW={first.width}
                    natH={first.height}
                    targetW={exactW}
                    targetH={exactH}
                    fill={fill}
                    focus={focus}
                    onFocusChange={setFocus}
                    background={fill === "pad" ? padColor : "transparent"}
                  />
                  {items.length > 1 && (
                    <Text type="secondary" className="fb-field-hint">
                      Preview is the first image. All {items.length} get the same size and
                      framing.
                    </Text>
                  )}
                </div>
              )}
            </>
          )}

          <div className="fb-field">
            <label className="fb-field-label">Output format</label>
            <Segmented
              block
              value={format}
              onChange={(v) => setFormat(v as OutputFormat)}
              options={formatOptions(items[0]?.file)}
            />
            <Text type="secondary" className="fb-field-hint">
              {format === "keep"
                ? `Keeps the original format${detectedLabel(items[0]?.file) ? ` (${detectedLabel(items[0]?.file)})` : ""} — resize without changing the file type.`
                : "Resizes and converts to this format in one step."}
            </Text>
          </div>

          {upscaleApplies && (
            <>
              <div
                className="fb-field"
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <label className="fb-field-label" style={{ margin: 0 }}>
                  Enlarge smaller images
                </label>
                <Switch checked={allowUpscale} onChange={setAllowUpscale} />
              </div>
              <Text type="secondary" className="fb-field-hint" style={{ marginTop: -8 }}>
                Only affects images SMALLER than your target, letting them scale up to reach
                it (which can look blurry). An image already bigger than the target gets
                shrunk either way.
              </Text>
            </>
          )}

          {preview && (
            <>
              <Divider style={{ margin: "18px 0" }} />
              <div className="fb-img-estimate">
                <div className="fb-img-estimate-row">
                  <span className="fb-img-estimate-before">
                    {items[0].width} × {items[0].height}
                  </span>
                  <span className="fb-img-estimate-after">
                    {preview.width} × {preview.height}
                  </span>
                </div>
                {items.length > 1 && (
                  <Text type="secondary" className="fb-text-fine" style={{ marginTop: 8, display: "block" }}>
                    Preview is for the first image; each is scaled to fit the same target.
                  </Text>
                )}
              </div>
            </>
          )}

          {pickerAvailable && (
            <>
              <Divider style={{ margin: "18px 0" }} />
              <div
                className="fb-field"
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <label className="fb-field-label" style={{ margin: 0 }}>
                  Choose where to save
                </label>
                <Switch checked={pickLocation} onChange={setPickLocation} />
              </div>
              <Text type="secondary" className="fb-field-hint" style={{ marginTop: -8 }}>
                Opens a Save dialog so you can pick the folder and overwrite the same file each
                time. Off sends it straight to Downloads, adding a new copy on every run.
              </Text>
            </>
          )}

          <Space direction="vertical" size={10} style={{ width: "100%", marginTop: 20 }}>
            <Button
              type="primary"
              size="large"
              icon={<DownloadOutlined />}
              block
              loading={busy}
              disabled={busy}
              onClick={onDownload}
            >
              {busy
                ? "Resizing…"
                : pickLocation && pickerAvailable
                  ? items.length > 1 ? "Resize & save ZIP…" : "Resize & save…"
                  : items.length > 1 ? "Resize & download ZIP" : "Resize & download"}
            </Button>
            <Text type="secondary" className="fb-text-fine" style={{ textAlign: "center", display: "block" }}>
              Done in your browser — nothing is uploaded.
            </Text>
          </Space>
        </>
      )}
    </div>
  );
}
