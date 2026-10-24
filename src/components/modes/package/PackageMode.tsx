import { useRef, useState } from "react";
import { Button, Divider, Empty, Input, Space, Typography, message } from "antd";
import {
  InboxOutlined,
  DownloadOutlined,
  PlusOutlined,
  ClearOutlined,
  FolderOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import type { ModeSurfaceProps } from "@/lib/modes";
import { PanelHeader } from "@/components/shell/PanelHeader";
import { DropZone } from "@/components/shell/DropZone";
import { usePackage } from "./PackageContext";
import { BundleRow } from "./BundleRow";
import { LoadKitButton } from "./LoadKitButton";
import { PreviewModal } from "./PreviewModal";
import { buildBundleZip, normalizeZipName } from "./buildZip";
import "./package.css";

const { Text } = Typography;

const PACKAGE_ACCENT = "#2f4f46";

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  // rel=noopener + target=_self keep it a same-tab download, not a navigation a
  // browser might route through the SPA/service worker.
  a.rel = "noopener";
  a.target = "_self";
  a.style.display = "none";
  document.body.appendChild(a);
  // Dispatch a real MouseEvent rather than .click(): after an await, some
  // browsers treat a bare .click() as non-user-initiated and quietly drop the
  // download. An explicit MouseEvent is reliably honored.
  a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  // Keep the object URL alive a bit longer — revoking too soon can abort the
  // download before the browser has read the blob.
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 4000);
}

/* ------------------------------------------------------------------ Canvas */

export function PackageCanvas({ isDark }: ModeSurfaceProps) {
  const { items, addFiles, clearAll } = usePackage();
  const addRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Empty state: the big inviting drop zone (the hero). Any files, any number.
  // The "Load a brand kit" affordance lives BELOW the drop zone as a sibling,
  // NOT inside it — the drop zone's whole surface is one big click target that
  // opens its own file picker, so nesting a button in it made the two pickers
  // fight (and a picked .json got added as a raw file instead of being parsed).
  if (items.length === 0) {
    return (
      <div className="fb-empty-stack">
        <DropZone
          title="Drop files to bundle"
          blurb="Add any files — documents, images, whatever. Name them, group them into folders if you like, and download one clean ZIP."
          accepts={["Any file type"]}
          multiple
          onFiles={addFiles}
          buttonLabel="Select files"
        />
        <div className="fb-dropzone-kit">
          <span className="fb-dropzone-kit-or">or</span>
          <LoadKitButton />
          <span className="fb-dropzone-kit-hint">
            Fill the list from a Brand Board <code>.brand-kit.json</code> — logo, QR, card,
            signature, and social assets, all at once.
          </span>
        </div>
      </div>
    );
  }

  // Loaded state: the editable file list, with an add-more strip on top.
  return (
    <div className="fb-bundle" data-dark={isDark}>
      <div className="fb-bundle-toolbar">
        <div>
          <span className="fb-bundle-count">{items.length} file{items.length === 1 ? "" : "s"}</span>
          <Text type="secondary" className="fb-bundle-sub">
            Rename any file, add a folder to group it, or drop more in.
          </Text>
        </div>
        <Space>
          <input
            ref={addRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.length) addFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
          <Button
            type="primary"
            ghost
            icon={<EyeOutlined />}
            onClick={() => setPreviewOpen(true)}
          >
            Preview
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => addRef.current?.click()}>
            Add files
          </Button>
          <LoadKitButton />
          <Button icon={<ClearOutlined />} onClick={clearAll} danger>
            Clear
          </Button>
        </Space>
      </div>

      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        items={items}
        isDark={isDark}
      />

      {/* Whole list is also a drop target so you can drag more anywhere. */}
      <div
        className="fb-bundle-list"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <div className="fb-row fb-row-head">
          <span className="fb-row-badge-head">Type</span>
          <span className="fb-row-name-head">Name in zip</span>
          <span className="fb-row-folder-head">Folder</span>
          <span className="fb-row-size-head">Size</span>
          <span className="fb-row-remove-head" />
        </div>
        {items.map((item) => (
          <BundleRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Panel */

export function PackagePanel({ isDark }: ModeSurfaceProps) {
  const { items, zipName, setZipName, folders, totalBytes } = usePackage();
  const [building, setBuilding] = useState(false);

  const hasFiles = items.length > 0;
  const previewName = normalizeZipName(zipName);
  const rootCount = items.filter((it) => !it.folder.trim()).length;

  const onDownload = async () => {
    setBuilding(true);
    // Let React actually PAINT the loading state before we start the heavy,
    // main-thread jszip work — otherwise the spinner never appears and the tab
    // just freezes with no feedback. Two rAFs guarantees a committed frame.
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    const t0 = performance.now();
    try {
      const result = await buildBundleZip({ items, zipName });
      const ms = Math.round(performance.now() - t0);
      console.info(`[File Builder] ZIP built in ${ms}ms (${result.fileCount} files)`);
      triggerDownload(result.blob, result.fileName);
      message.success(
        `ZIP built in ${(ms / 1000).toFixed(1)}s — ${result.fileCount} file${result.fileCount === 1 ? "" : "s"}`,
      );
    } catch (err) {
      console.error("[File Builder] ZIP build failed:", err);
      const detail = err instanceof Error ? err.message : String(err);
      message.error(`Couldn't build the ZIP — ${detail}`);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div data-dark={isDark}>
      <PanelHeader icon={<InboxOutlined />} title="Bundle into a ZIP" accent={PACKAGE_ACCENT} />

      {!hasFiles ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Drop files to get started"
          style={{ marginTop: 24 }}
        />
      ) : (
        <>
          <div className="fb-field">
            <label className="fb-field-label">ZIP file name</label>
            <Input
              placeholder="my-files"
              value={zipName}
              onChange={(e) => setZipName(e.target.value)}
              addonAfter=".zip"
              maxLength={80}
            />
            <Text type="secondary" className="fb-field-hint">
              Downloads as <code>{previewName}</code>
            </Text>
          </div>

          <Divider style={{ margin: "18px 0" }} />

          <div className="fb-summary">
            <div className="fb-summary-row">
              <Text type="secondary">Files</Text>
              <Text strong>{items.length}</Text>
            </div>
            <div className="fb-summary-row">
              <Text type="secondary">At the root</Text>
              <Text strong>{rootCount}</Text>
            </div>
            <div className="fb-summary-row">
              <Text type="secondary">Total size</Text>
              <Text strong>
                {totalBytes < 1024 * 1024
                  ? `${(totalBytes / 1024).toFixed(0)} kB`
                  : `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`}
              </Text>
            </div>
          </div>

          {folders.length > 0 && (
            <div className="fb-folder-list">
              <Text type="secondary" className="fb-text-fine">
                Folders in this ZIP
              </Text>
              <div className="fb-folder-chips">
                {folders.map((f) => (
                  <span key={f} className="fb-folder-chip">
                    <FolderOutlined /> {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          <Space direction="vertical" size={10} style={{ width: "100%", marginTop: 20 }}>
            <Button
              type="primary"
              size="large"
              icon={<DownloadOutlined />}
              block
              loading={building}
              disabled={building}
              onClick={onDownload}
            >
              {building ? "Building ZIP…" : "Download ZIP"}
            </Button>
            <Text type="secondary" className="fb-text-fine" style={{ textAlign: "center", display: "block" }}>
              {building
                ? "Packing your files — this stays in your browser."
                : "Built in your browser — nothing is uploaded."}
            </Text>
          </Space>
        </>
      )}
    </div>
  );
}
