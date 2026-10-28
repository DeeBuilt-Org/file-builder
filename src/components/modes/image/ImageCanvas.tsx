import { useRef } from "react";
import { Button, Space, Typography, message } from "antd";
import { PlusOutlined, ClearOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ModeSurfaceProps } from "@/lib/modes";
import { DropZone } from "@/components/shell/DropZone";
import { humanSize } from "@/lib/image-ops";
import { useImageWork } from "./ImageWorkContext";
import "./image.css";

/**
 * ImageCanvas — the shared center surface for the Resize / Convert / Compress
 * modes. Empty state is the big DropZone; loaded state is a thumbnail grid of the
 * working images with a toolbar. The whole grid is a drop target so more images
 * can be dragged in anywhere. All three modes render this exact canvas — the
 * per-mode difference lives entirely in the panel.
 */
export function ImageCanvas({
  isDark,
  blurb,
  accepts,
}: Pick<ModeSurfaceProps, "isDark"> & { blurb: string; accepts: string[] }) {
  const { items, addFiles, remove, clearAll } = useImageWork();
  const addRef = useRef<HTMLInputElement>(null);

  const onAdd = async (files: File[]) => {
    const { added, skipped } = await addFiles(files);
    if (skipped.length) {
      message.warning(
        `Skipped ${skipped.length} file${skipped.length === 1 ? "" : "s"} that couldn't be read as an image.`,
      );
    }
    if (added === 0 && !skipped.length) return;
  };

  if (items.length === 0) {
    return (
      <div className="fb-empty-stack">
        <DropZone
          title="Drop images to get started"
          blurb={blurb}
          accepts={accepts}
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
            {items.length} image{items.length === 1 ? "" : "s"}
          </span>
          <Typography.Text type="secondary" className="fb-img-sub">
            Adjust the options on the right, then download.
          </Typography.Text>
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
        {items.map((it) => (
          <div key={it.id} className="fb-img-tile">
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
              <span className="fb-img-dims">
                {it.width} × {it.height} · {humanSize(it.file.size)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
