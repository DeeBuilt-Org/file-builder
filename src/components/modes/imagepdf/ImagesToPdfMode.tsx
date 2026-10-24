import { useRef, useState } from "react";
import { Button, Divider, Empty, Input, Segmented, Space, Typography, message } from "antd";
import {
  FilePdfOutlined,
  DownloadOutlined,
  PlusOutlined,
  ClearOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import type { ModeSurfaceProps } from "@/lib/modes";
import { PanelHeader } from "@/components/shell/PanelHeader";
import { DropZone } from "@/components/shell/DropZone";
import { downloadBlob } from "@/lib/download";
import { useImagesToPdf } from "./ImagesToPdfContext";
import { buildImagesPdf, type PageLayout, type PageOrientation } from "./buildPdf";
import "@/components/modes/image/image.css";
import "./imagepdf.css";

const PDF_ACCENT = "#d35400";
const { Text } = Typography;

/** Standard page sizes in inches (portrait), for the on-screen dimension hint. */
const PAGE_INCHES: Record<"a4" | "letter", { w: number; h: number }> = {
  a4: { w: 8.27, h: 11.69 },
  letter: { w: 8.5, h: 11 },
};

/** A human "8.5 × 11 in" string for the chosen size + orientation. */
function pageDimLabel(layout: PageLayout, orientation: PageOrientation): string | null {
  if (layout === "fit") return null;
  const base = PAGE_INCHES[layout];
  // "auto" is decided per image at build time, so describe it as portrait here
  // (the label is guidance, not a promise) and say so.
  const landscape = orientation === "landscape";
  const w = landscape ? base.h : base.w;
  const h = landscape ? base.w : base.h;
  return `${w} × ${h} in`;
}

export function ImagesToPdfCanvas({ isDark }: ModeSurfaceProps) {
  const { items, addFiles, remove, move, clearAll } = useImagesToPdf();
  const addRef = useRef<HTMLInputElement>(null);
  const dragId = useRef<string | null>(null);

  const onAdd = async (files: File[]) => {
    const { skipped } = await addFiles(files);
    if (skipped.length) {
      message.warning(
        `Skipped ${skipped.length} file${skipped.length === 1 ? "" : "s"} that couldn't be read as an image.`,
      );
    }
  };

  if (items.length === 0) {
    return (
      <div className="fb-empty-stack">
        <DropZone
          title="Drop images to combine into a PDF"
          blurb="Add images in the order you want them — each becomes one page. Drag to reorder before you download."
          accepts={["PNG", "JPG", "WebP", "GIF"]}
          accept="image/*"
          multiple
          onFiles={onAdd}
          buttonLabel="Select images"
        />
      </div>
    );
  }

  return (
    <div className="fb-img" data-dark={isDark}>
      <div className="fb-img-toolbar">
        <div>
          <span className="fb-img-count">
            {items.length} page{items.length === 1 ? "" : "s"}
          </span>
          <Text type="secondary" className="fb-img-sub">
            Drag a tile to reorder. Order top-left to bottom-right is the page order.
          </Text>
        </div>
        <Space>
          <input
            ref={addRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.length) onAdd(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
          <Button icon={<PlusOutlined />} onClick={() => addRef.current?.click()}>
            Add images
          </Button>
          <Button icon={<ClearOutlined />} onClick={clearAll} danger>
            Clear
          </Button>
        </Space>
      </div>

      <div
        className="fb-img-grid"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) onAdd(Array.from(e.dataTransfer.files));
        }}
      >
        {items.map((it, idx) => (
          <div
            key={it.id}
            className="fb-img-tile fb-pdf-tile"
            draggable
            onDragStart={() => (dragId.current = it.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragId.current && dragId.current !== it.id) move(dragId.current, it.id);
              dragId.current = null;
            }}
          >
            <span className="fb-pdf-page-num">{idx + 1}</span>
            <button
              type="button"
              className="fb-img-remove"
              onClick={() => remove(it.id)}
              aria-label={`Remove ${it.name}`}
            >
              <DeleteOutlined />
            </button>
            <div className="fb-img-thumb">
              <img src={it.previewUrl} alt={it.name} loading="lazy" />
            </div>
            <div className="fb-img-meta">
              <span className="fb-img-name" title={it.name}>
                {it.name}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ImagesToPdfPanel({ isDark }: ModeSurfaceProps) {
  const { items, hasImages } = useImagesToPdf();
  const [layout, setLayout] = useState<PageLayout>("fit");
  const [orientation, setOrientation] = useState<PageOrientation>("auto");
  const [name, setName] = useState("images");
  const [busy, setBusy] = useState(false);

  const outName = `${name.trim().replace(/\.pdf$/i, "") || "images"}.pdf`;

  const onDownload = async () => {
    if (!hasImages) return;
    setBusy(true);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    try {
      const blob = await buildImagesPdf(items, { layout, orientation });
      downloadBlob(blob, outName);
      message.success(`Built a ${items.length}-page PDF.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      message.error(`Couldn't build the PDF — ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-dark={isDark}>
      <PanelHeader icon={<FilePdfOutlined />} title="Images → PDF" accent={PDF_ACCENT} />

      {!hasImages ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Add images to build a PDF"
          style={{ marginTop: 24 }}
        />
      ) : (
        <>
          <div className="fb-field">
            <label className="fb-field-label">Page size</label>
            <Segmented
              block
              value={layout}
              onChange={(v) => setLayout(v as PageLayout)}
              options={[
                { label: "Fit image", value: "fit" },
                { label: "A4", value: "a4" },
                { label: "Letter", value: "letter" },
              ]}
            />
            <Text type="secondary" className="fb-field-hint">
              {layout === "fit"
                ? "Each page is exactly the image — a tight PDF with no borders."
                : layout === "a4"
                  ? "A4 is the international standard page (slightly taller and narrower than US Letter)."
                  : "US Letter is the standard US page size."}
            </Text>
          </div>

          {layout !== "fit" && (
            <div className="fb-field">
              <label className="fb-field-label">Orientation</label>
              <Segmented
                block
                value={orientation}
                onChange={(v) => setOrientation(v as PageOrientation)}
                options={[
                  { label: "Auto", value: "auto" },
                  { label: "Portrait", value: "portrait" },
                  { label: "Landscape", value: "landscape" },
                ]}
              />
              <Text type="secondary" className="fb-field-hint">
                {orientation === "auto"
                  ? `Each page matches its image — portrait ${pageDimLabel(layout, "portrait")}, landscape ${pageDimLabel(layout, "landscape")}.`
                  : `Page size: ${pageDimLabel(layout, orientation)}.`}
              </Text>
            </div>
          )}

          <div className="fb-field">
            <label className="fb-field-label">PDF file name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              addonAfter=".pdf"
              maxLength={80}
            />
            <Text type="secondary" className="fb-field-hint">
              Downloads as <code>{outName}</code>
            </Text>
          </div>

          <Divider style={{ margin: "18px 0" }} />
          <div className="fb-summary">
            <div className="fb-summary-row">
              <Text type="secondary">Pages</Text>
              <Text strong>{items.length}</Text>
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
              {busy ? "Building PDF…" : "Build & download PDF"}
            </Button>
            <Text type="secondary" className="fb-text-fine" style={{ textAlign: "center", display: "block" }}>
              Built in your browser — nothing is uploaded.
            </Text>
          </Space>
        </>
      )}
    </div>
  );
}
