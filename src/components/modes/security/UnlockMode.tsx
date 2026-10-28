import { Alert, Button, Empty, Space, Typography, message } from "antd";
import {
  UnlockOutlined,
  ClearOutlined,
  DownloadOutlined,
  AppstoreOutlined,
  EditOutlined,
  LockOutlined,
} from "@ant-design/icons";
import type { ModeSurfaceProps } from "@/lib/modes";
import { PanelHeader } from "@/components/shell/PanelHeader";
import { DropZone } from "@/components/shell/DropZone";
import { PasswordPrompt } from "@/components/shell/PasswordPrompt";
import { downloadBlob } from "@/lib/download";
import { useOrganize } from "@/components/modes/organize/OrganizeContext";
import { useSignFill } from "@/components/modes/signfill/SignFillContext";
import { useUnlock } from "./UnlockContext";
import { useProtect } from "./ProtectContext";
import { PdfFileCard } from "./PdfFileCard";
import { suffixedName } from "./securityFile";
import "./security.css";

export const UNLOCK_ACCENT = "#0369a1";

/* ------------------------------------------------------------------ Canvas */

export function UnlockCanvas({ isDark, goToMode }: ModeSurfaceProps) {
  const { file, preview, loading, unlocked, addFile, unlock, clear } = useUnlock();
  const protect = useProtect();

  const onFiles = async (files: File[]) => {
    const result = await addFile(files[0]);
    if (result === "not-pdf") message.warning("Unlock only takes PDFs.");
    if (result === "unreadable") message.error("That doesn't look like a PDF I can open.");
  };

  if (!file) {
    return (
      <DropZone
        title={loading ? "Opening your PDF…" : "Drop a PDF to unlock"}
        blurb="Remove a password you know from a PDF. It is decrypted in your browser and never uploaded. A lost password can't be recovered."
        accepts={["PDF"]}
        accept="application/pdf,.pdf"
        multiple={false}
        onFiles={onFiles}
        buttonLabel="Select a PDF"
      />
    );
  }

  return (
    <div className="fb-sec" data-dark={isDark}>
      <PdfFileCard
        name={file.name}
        size={file.size}
        preview={preview}
        locked={file.lock !== "none" && !unlocked}
      >
        {file.lock === "none" ? (
          <Alert
            type="info"
            showIcon
            message="This PDF has no password."
            action={
              <Button
                size="small"
                icon={<LockOutlined />}
                onClick={async () => {
                  const handoff = new File([file.bytes], file.name, { type: "application/pdf" });
                  await protect.addFile(handoff);
                  goToMode("protect");
                }}
              >
                Protect it
              </Button>
            }
          />
        ) : unlocked ? (
          <Alert type="success" showIcon message="Unlocked. The password was removed." />
        ) : null}
      </PdfFileCard>

      {file.lock !== "none" && !unlocked && (
        <div className="fb-sec-prompt">
          <PasswordPrompt lock={file.lock} fileName={file.name} onSubmit={unlock} />
        </div>
      )}

      <Button icon={<ClearOutlined />} onClick={clear} className="fb-sec-another">
        Choose another PDF
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------- Panel */

export function UnlockPanel({ isDark, goToMode }: ModeSurfaceProps) {
  const { file, unlocked, clear } = useUnlock();
  const organize = useOrganize();
  const signFill = useSignFill();

  const unlockedFile = () =>
    file && unlocked
      ? new File([unlocked], suffixedName(file.name, "unlocked"), { type: "application/pdf" })
      : null;

  const continueIn = async (target: "organize" | "sign-fill") => {
    const handoff = unlockedFile();
    if (!handoff) return;
    if (target === "organize") await organize.addPdfs([handoff]);
    else await signFill.loadPdf(handoff);
    goToMode(target);
  };

  return (
    <div data-dark={isDark}>
      <PanelHeader icon={<UnlockOutlined />} title="Unlock PDF" accent={UNLOCK_ACCENT} />

      {!file ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Drop a PDF to get started"
          style={{ marginTop: 24 }}
        />
      ) : !unlocked ? (
        <Typography.Paragraph type="secondary">
          {file.lock === "none"
            ? "This PDF has no password, so there is nothing to unlock."
            : file.lock === "open"
              ? "Enter the PDF's password to remove it. Unlock can't recover a lost password."
              : "This PDF opens without a password but limits printing, copying or editing. Enter its permissions password to remove the restrictions."}
        </Typography.Paragraph>
      ) : (
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Button
            type="primary"
            size="large"
            icon={<DownloadOutlined />}
            block
            onClick={() => {
              const out = unlockedFile();
              if (!out) return;
              downloadBlob(out, out.name);
              message.success("Unlocked PDF ready");
            }}
          >
            Download unlocked PDF
          </Button>
          <Button icon={<AppstoreOutlined />} block onClick={() => void continueIn("organize")}>
            Continue in Organize
          </Button>
          <Button icon={<EditOutlined />} block onClick={() => void continueIn("sign-fill")}>
            Continue in Sign &amp; Fill
          </Button>
          <Button icon={<ClearOutlined />} block danger onClick={clear}>
            Start over
          </Button>
          <Typography.Text
            type="secondary"
            className="fb-text-fine"
            style={{ textAlign: "center", display: "block" }}
          >
            Decrypted in your browser. Your PDF is never uploaded.
          </Typography.Text>
        </Space>
      )}
    </div>
  );
}
