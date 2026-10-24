import { useRef, useState } from "react";
import { Button, Divider, Empty, Space, Typography, message } from "antd";
import {
  AppstoreOutlined,
  PlusOutlined,
  ClearOutlined,
  RotateRightOutlined,
  RotateLeftOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ExportOutlined,
  CheckSquareOutlined,
} from "@ant-design/icons";
import type { ModeSurfaceProps } from "@/lib/modes";
import { PanelHeader } from "@/components/shell/PanelHeader";
import { DropZone } from "@/components/shell/DropZone";
import { buildFromPages, type OutputPageRef } from "@/lib/pdf-ops";
import { downloadBlob } from "@/lib/download";
import { useOrganize } from "./OrganizeContext";
import { PageThumb } from "./PageThumb";
import "./organize.css";

const ORGANIZE_ACCENT = "#0f766e";

/* ------------------------------------------------------------------ Canvas */

export function OrganizeCanvas({ isDark }: ModeSurfaceProps) {
  const { hasDoc, pages, addPdfs, reorder } = useOrganize();
  const addRef = useRef<HTMLInputElement>(null);
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const onFiles = async (files: File[]) => {
    const { added, skipped } = await addPdfs(files);
    if (added > 0) message.success(`Added ${added} PDF${added === 1 ? "" : "s"}`);
    if (skipped.length) {
      message.warning(
        `Skipped ${skipped.length} file${skipped.length === 1 ? "" : "s"} — Organize only takes PDFs.`,
      );
    }
  };

  if (!hasDoc) {
    return (
      <DropZone
        title="Drop a PDF to organize"
        blurb="Reorder pages by dragging, rotate or delete them, pull out a range, or drop a second PDF to merge. Everything stays in your browser."
        accepts={["PDF"]}
        accept="application/pdf,.pdf"
        multiple
        onFiles={onFiles}
        buttonLabel="Select a PDF"
      />
    );
  }

  return (
    <div className="fb-org" data-dark={isDark}>
      <div className="fb-org-toolbar">
        <div>
          <span className="fb-org-count">
            {pages.length} page{pages.length === 1 ? "" : "s"}
          </span>
          <Typography.Text type="secondary" className="fb-org-sub">
            Drag to reorder. Tap a page to select it. Drop another PDF to merge.
          </Typography.Text>
        </div>
        <Space>
          <input
            ref={addRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.length) void onFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
          <Button icon={<PlusOutlined />} onClick={() => addRef.current?.click()}>
            Add / merge PDF
          </Button>
        </Space>
      </div>

      <div
        className="fb-org-grid"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          // Dropping OS files onto the grid = add/merge them.
          if (e.dataTransfer.files.length) {
            e.preventDefault();
            void onFiles(Array.from(e.dataTransfer.files));
          }
        }}
      >
        {pages.map((page, i) => (
          <PageThumb
            key={page.id}
            page={page}
            index={i}
            onDragStart={(id) => {
              dragId.current = id;
            }}
            onDrop={(toId) => {
              if (dragId.current) reorder(dragId.current, toId);
              dragId.current = null;
            }}
            dragOverId={dragOverId}
            setDragOverId={setDragOverId}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Panel */
/**
 * The Canvas and Panel render in SEPARATE shell regions, so they can't share a
 * provider nested in either one. `OrganizeProvider` is hosted at the app level
 * (in FileBuilderApp), above both regions — the same pattern PackageProvider
 * uses — so both surfaces read one state tree.
 */

export function OrganizePanel({ isDark }: ModeSurfaceProps) {
  const {
    pages,
    sources,
    selectedIds,
    selectAll,
    rotatePages,
    deletePages,
    clearAll,
    baseName,
  } = useOrganize();
  const [busy, setBusy] = useState(false);

  const hasPages = pages.length > 0;
  const selCount = selectedIds.length;
  const allSelected = hasPages && selCount === pages.length;

  const toRefs = (ids: string[]): OutputPageRef[] =>
    pages
      .filter((p) => ids.includes(p.id))
      .map((p) => ({ docId: p.docId, pageIndex: p.pageIndex, rotation: p.rotation }));

  const build = async (which: "all" | "selected") => {
    const list = which === "all" ? pages.map((p) => p.id) : selectedIds;
    if (list.length === 0) return;
    setBusy(true);
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    try {
      const bytes = await buildFromPages(sources, toRefs(list));
      const suffix = which === "selected" ? "-extracted" : "-organized";
      // Copy into a standalone ArrayBuffer so the Blob owns clean bytes.
      const out = bytes.slice();
      downloadBlob(new Blob([out], { type: "application/pdf" }), `${baseName}${suffix}.pdf`);
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
      <PanelHeader icon={<AppstoreOutlined />} title="Organize pages" accent={ORGANIZE_ACCENT} />

      {!hasPages ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Drop a PDF to get started"
          style={{ marginTop: 24 }}
        />
      ) : (
        <>
          <div className="fb-org-selbar">
            <Button
              size="small"
              icon={<CheckSquareOutlined />}
              onClick={() => selectAll(!allSelected)}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
            <Typography.Text type="secondary" className="fb-text-fine">
              {selCount} selected
            </Typography.Text>
          </div>

          <Typography.Text type="secondary" className="fb-field-hint" style={{ display: "block", marginBottom: 12 }}>
            Actions apply to the selected pages (or all, where noted).
          </Typography.Text>

          <Space wrap size={8} style={{ marginBottom: 8 }}>
            <Button
              icon={<RotateLeftOutlined />}
              disabled={selCount === 0}
              onClick={() => rotatePages(selectedIds, -90)}
            >
              Rotate left
            </Button>
            <Button
              icon={<RotateRightOutlined />}
              disabled={selCount === 0}
              onClick={() => rotatePages(selectedIds, 90)}
            >
              Rotate right
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={selCount === 0}
              onClick={() => deletePages(selectedIds)}
            >
              Delete
            </Button>
          </Space>

          <Divider style={{ margin: "16px 0" }} />

          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            <Button
              type="primary"
              size="large"
              icon={<DownloadOutlined />}
              block
              loading={busy}
              onClick={() => build("all")}
            >
              Download PDF ({pages.length} page{pages.length === 1 ? "" : "s"})
            </Button>
            <Button
              icon={<ExportOutlined />}
              block
              disabled={selCount === 0 || busy}
              onClick={() => build("selected")}
            >
              Extract selected ({selCount})
            </Button>
            <Button icon={<ClearOutlined />} block danger onClick={clearAll} disabled={busy}>
              Start over
            </Button>
            <Typography.Text
              type="secondary"
              className="fb-text-fine"
              style={{ textAlign: "center", display: "block" }}
            >
              Built in your browser — nothing is uploaded.
            </Typography.Text>
          </Space>
        </>
      )}
    </div>
  );
}
