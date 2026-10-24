import { useState } from "react";
import { Button, Divider, Empty, Segmented, Slider, Space, Typography, message } from "antd";
import { SwapOutlined, DownloadOutlined } from "@ant-design/icons";
import type { ModeSurfaceProps } from "@/lib/modes";
import { PanelHeader } from "@/components/shell/PanelHeader";
import { ImageCanvas } from "./ImageCanvas";
import { useImageWork } from "./ImageWorkContext";
import { deliverImages } from "./imageOutput";
import {
  convertImage,
  withExt,
  formatFor,
  resolveOutput,
  detectedLabel,
  RASTER_FORMATS,
  type OutputFormat,
} from "@/lib/image-ops";
import "./image.css";

const CONVERT_ACCENT = "#8e44ad";
const { Text } = Typography;

/**
 * Output-format tabs. The "keep" tab shows the DETECTED source format (e.g.
 * "PNG · keep") so doing nothing is clearly a no-op AND the label fits the tab.
 */
function convertOptions(sourceFile: File | undefined): { label: string; value: OutputFormat }[] {
  const detected = detectedLabel(sourceFile);
  return [
    { label: detected ? `${detected} · keep` : "Keep", value: "keep" },
    ...RASTER_FORMATS.map((f) => ({ label: f.label, value: f.mime as OutputFormat })),
  ];
}

export function ConvertCanvas({ isDark }: ModeSurfaceProps) {
  return (
    <ImageCanvas
      isDark={isDark}
      blurb="Add one or more images and change them between PNG, JPG, and WebP. PNG keeps transparency; JPG is smallest for photos; WebP splits the difference."
      accepts={["PNG", "JPG", "WebP", "GIF", "SVG"]}
    />
  );
}

export function ConvertPanel({ isDark }: ModeSurfaceProps) {
  const { items, hasImages } = useImageWork();
  const [choice, setChoice] = useState<OutputFormat>("keep");
  const [quality, setQuality] = useState(90);
  const [busy, setBusy] = useState(false);

  // What "keep" resolves to for the first image — drives the hint + whether a
  // quality slider is relevant (only lossy targets use quality).
  const firstOut = items[0] ? resolveOutput(choice, items[0].file) : "image/png";
  const firstFmt = formatFor(firstOut);
  // Name the real detected format for "keep" so the summary isn't vague.
  const outLabel = choice === "keep" ? `${firstFmt.label} (unchanged)` : `.${firstFmt.ext}`;

  const onDownload = async () => {
    if (!hasImages) return;
    setBusy(true);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    try {
      const out = [];
      for (const it of items) {
        const to = resolveOutput(choice, it.file);
        const ext = formatFor(to).ext;
        const { blob } = await convertImage(it.file, to, quality / 100);
        out.push({ name: withExt(it.name, ext), blob });
      }
      const zipTag = choice === "keep" ? "converted" : `converted-${firstFmt.ext}`;
      await deliverImages(out, zipTag);
      message.success(`Converted ${out.length} image${out.length === 1 ? "" : "s"}.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      message.error(`Couldn't convert — ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-dark={isDark}>
      <PanelHeader icon={<SwapOutlined />} title="Convert format" accent={CONVERT_ACCENT} />

      {!hasImages ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Add images to convert"
          style={{ marginTop: 24 }}
        />
      ) : (
        <>
          <div className="fb-field">
            <label className="fb-field-label">Convert to</label>
            <Segmented
              block
              value={choice}
              onChange={(v) => setChoice(v as OutputFormat)}
              options={convertOptions(items[0]?.file)}
            />
            <Text type="secondary" className="fb-field-hint">
              {choice === "keep"
                ? "Each image keeps its own format — pick a format above to change it."
                : choice === "image/png"
                  ? "Lossless, keeps transparency. Best for logos and graphics."
                  : choice === "image/jpeg"
                    ? "Smallest for photos. No transparency — clear areas fill white."
                    : "Modern format, small size, keeps transparency."}
            </Text>
          </div>

          {firstFmt.lossy && (
            <div className="fb-field">
              <label className="fb-field-label">Quality — {quality}%</label>
              <Slider min={40} max={100} value={quality} onChange={setQuality} />
              <Text type="secondary" className="fb-field-hint">
                Applies to JPG and WebP. Lower = smaller file. 80–90% is usually indistinguishable.
              </Text>
            </div>
          )}

          <Divider style={{ margin: "18px 0" }} />
          <div className="fb-summary">
            <div className="fb-summary-row">
              <Text type="secondary">Images</Text>
              <Text strong>{items.length}</Text>
            </div>
            <div className="fb-summary-row">
              <Text type="secondary">Output</Text>
              <Text strong>{outLabel}</Text>
            </div>
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
              {busy ? "Converting…" : items.length > 1 ? `Convert & download ZIP` : "Convert & download"}
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
