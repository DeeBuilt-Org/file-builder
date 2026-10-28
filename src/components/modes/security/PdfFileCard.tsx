import type { ReactNode } from "react";
import { Typography } from "antd";
import { LockOutlined, FilePdfOutlined } from "@ant-design/icons";
import { humanSize } from "@/lib/image-ops";
import type { FilePreview } from "./securityFile";

/**
 * PdfFileCard — the loaded-file view shared by Protect and Unlock: first-page
 * preview, file name, size and page count, with a status line or action below.
 * A locked file with no preview shows a lock in place of the page.
 */
export function PdfFileCard({
  name,
  size,
  preview,
  locked,
  children,
}: {
  name: string;
  size: number;
  preview: FilePreview | null;
  locked: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="fb-sec-card">
      <div className="fb-sec-page">
        {preview ? (
          <img src={preview.url} alt={`First page of ${name}`} />
        ) : (
          <span className="fb-sec-page-icon">{locked ? <LockOutlined /> : <FilePdfOutlined />}</span>
        )}
      </div>
      <div className="fb-sec-meta">
        <Typography.Text strong className="fb-sec-name" ellipsis={{ tooltip: name }}>
          {name}
        </Typography.Text>
        <Typography.Text type="secondary" className="fb-text-fine">
          {humanSize(size)}
          {preview && ` · ${preview.pageCount} page${preview.pageCount === 1 ? "" : "s"}`}
        </Typography.Text>
        {children && <div className="fb-sec-status">{children}</div>}
      </div>
    </div>
  );
}
