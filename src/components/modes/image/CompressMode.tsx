import { useEffect, useRef, useState } from "react";
import { Button, Divider, Empty, Segmented, Slider, Space, Spin, Typography, message } from "antd";
import { CompressOutlined, DownloadOutlined } from "@ant-design/icons";
import type { ModeSurfaceProps } from "@/lib/modes";
import { PanelHeader } from "@/components/shell/PanelHeader";
import { ImageCanvas } from "./ImageCanvas";
import { useImageWork } from "./ImageWorkContext";
import { deliverImages } from "./imageOutput";
import {
  compressImage,
  withExt,
  formatFor,
  resolveOutput,
  detectedLabel,
  RASTER_FORMATS,
  humanSize,
  sizeDelta,
  type OutputFormat,
} from "@/lib/image-ops";
import "./image.css";

const COMPRESS_ACCENT = "#c0392b";
const { Text } = Typography;

/** The three tiers are quality levels — the OUTPUT FORMAT is a separate choice. */
type Tier = "basic" | "moderate" | "strong";
const TIER_QUALITY: Record<Tier, { label: string; quality: number }> = {
  basic: { label: "Basic", quality: 0.85 },
  moderate: { label: "Moderate", quality: 0.7 },
  strong: { label: "Strong", quality: 0.5 },
};

/**
 * Output-format tabs. "keep" (the default — never surprise-convert) shows the
 * DETECTED source format so it fits the tab and tells the user what they'll get.
 */
function formatOptions(sourceFile: File | undefined): { label: string; value: OutputFormat }[] {
  const detected = detectedLabel(sourceFile);
  return [
    { label: detected ? `${detected} · keep` : "Keep", value: "keep" },
    ...RASTER_FORMATS.map((f) => ({ label: f.label, value: f.mime as OutputFormat })),
  ];
}

export function CompressCanvas({ isDark }: ModeSurfaceProps) {
  return (
    <ImageCanvas
      isDark={isDark}
      blurb="Add one or more images and shrink their file size. Pick a strength and see the estimated new size before you download."
      accepts={["PNG", "JPG", "WebP"]}
    />
  );
}

export function CompressPanel({ isDark }: ModeSurfaceProps) {
  const { items, hasImages } = useImageWork();
  const [tier, setTier] = useState<Tier>("moderate");
  const [format, setFormat] = useState<OutputFormat>("keep");
  const [busy, setBusy] = useState(false);

  // Live estimate: re-encode the FIRST image at the current settings so the
  // readout is real, not a guess. Debounced, cancelled if inputs change mid-encode.
  const [estimate, setEstimate] = useState<{ before: number; after: number } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const firstId = items[0]?.id;

  // The concrete output MIME for the FIRST image (what "keep" resolves to).
  const firstOut = items[0] ? resolveOutput(format, items[0].file) : "image/png";
  // PNG is lossless — the quality dial does nothing, so a PNG-in/PNG-out
  // "compress" barely shrinks. Flag it honestly instead of pretending.
  const losslessPng = firstOut === "image/png";

  useEffect(() => {
    const first = items[0];
    if (!first) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    setEstimating(true);
    const t = setTimeout(async () => {
      try {
        const { quality } = TIER_QUALITY[tier];
        const to = resolveOutput(format, first.file);
        const { blob } = await compressImage(first.file, { quality, to });
        if (!cancelled) setEstimate({ before: first.file.size, after: blob.size });
      } catch {
        if (!cancelled) setEstimate(null);
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [firstId, tier, format, items]);

  const delta = estimate ? sizeDelta(estimate.before, estimate.after) : 0;

  const onDownload = async () => {
    if (!hasImages) return;
    setBusy(true);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    try {
      const { quality } = TIER_QUALITY[tier];
      const out = [];
      let before = 0;
      let after = 0;
      for (const it of items) {
        // "Keep" resolves per-file, so a mixed batch each keeps its own format.
        const to = resolveOutput(format, it.file);
        const { blob } = await compressImage(it.file, { quality, to });
        const ext = formatFor(to).ext;
        before += it.file.size;
        after += blob.size;
        out.push({ name: withExt(it.name, ext), blob });
      }
      await deliverImages(out, "compressed-images");
      const pct = sizeDelta(before, after);
      message.success(
        pct > 0
          ? `${humanSize(before)} → ${humanSize(after)} · ${pct}% smaller`
          : `Compressed ${out.length} image${out.length === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      message.error(`Couldn't compress — ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-dark={isDark}>
      <PanelHeader icon={<CompressOutlined />} title="Compress images" accent={COMPRESS_ACCENT} />

      {!hasImages ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Add images to compress"
          style={{ marginTop: 24 }}
        />
      ) : (
        <>
          <div className="fb-field">
            <label className="fb-field-label">Strength</label>
            <Segmented
              block
              value={tier}
              onChange={(v) => setTier(v as Tier)}
              options={(Object.keys(TIER_QUALITY) as Tier[]).map((t) => ({
                label: TIER_QUALITY[t].label,
                value: t,
              }))}
            />
            <Text type="secondary" className="fb-field-hint">
              Stronger = smaller file, softer detail.
            </Text>
          </div>

          <div className="fb-field">
            <label className="fb-field-label">Output format</label>
            <Segmented
              block
              value={format}
              onChange={(v) => setFormat(v as OutputFormat)}
              options={formatOptions(items[0]?.file)}
            />
            <Text type="secondary" className="fb-field-hint">
              Keeps your image's own format by default — a JPG stays a JPG.
            </Text>
            {losslessPng && (
              <Text type="secondary" className="fb-field-hint" style={{ marginTop: 6 }}>
                Heads up: PNG is lossless, so compressing PNG→PNG barely shrinks. For a real
                size drop on a photo, choose <strong>JPG</strong>.
              </Text>
            )}
          </div>

          <Divider style={{ margin: "18px 0" }} />

          <div className="fb-img-estimate">
            <div className="fb-img-estimate-row">
              <span className="fb-img-estimate-before">
                {estimate ? humanSize(estimate.before) : "—"}
              </span>
              <span className="fb-img-estimate-after">
                {estimating ? <Spin size="small" /> : estimate ? humanSize(estimate.after) : "—"}
              </span>
            </div>
            {estimate && !estimating && (
              <span
                className="fb-img-estimate-delta"
                data-dir={delta >= 0 ? "down" : "up"}
              >
                {delta >= 0 ? `${delta}% smaller` : `${Math.abs(delta)}% larger`}
              </span>
            )}
            <div className="fb-img-bar">
              <div
                className="fb-img-bar-fill"
                style={{
                  // Bar fills with how much was SAVED, so a bigger bar = a better
                  // result. Green = savings (good); red only if it got larger.
                  width: estimate ? `${Math.min(100, Math.max(4, delta))}%` : "0%",
                  background: delta >= 0 ? "#2f9e5f" : "#c0392b",
                }}
              />
            </div>
            {items.length > 1 && (
              <Text type="secondary" className="fb-text-fine" style={{ marginTop: 10, display: "block" }}>
                Estimate is for the first image; all {items.length} are compressed the same way.
              </Text>
            )}
            {estimate && delta <= 2 && (
              <Text type="secondary" className="fb-text-fine" style={{ marginTop: 10, display: "block" }}>
                This image is already well-compressed — there's little to save here.
              </Text>
            )}
          </div>

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
              {busy ? "Compressing…" : items.length > 1 ? "Compress & download ZIP" : "Compress & download"}
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
