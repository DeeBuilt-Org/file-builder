import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Empty,
  Input,
  Space,
  Switch,
  Typography,
  message,
} from "antd";
import {
  LockOutlined,
  ClearOutlined,
  DownloadOutlined,
  ReloadOutlined,
  UnlockOutlined,
} from "@ant-design/icons";
import type { ModeSurfaceProps } from "@/lib/modes";
import { PanelHeader } from "@/components/shell/PanelHeader";
import { DropZone } from "@/components/shell/DropZone";
import { toArrayBuffer } from "@/components/shell/UnlockGate";
import { downloadBlob } from "@/lib/download";
import {
  ALL_PERMISSIONS,
  generatePassword,
  passwordProblem,
  protectPdf,
  type PdfPermissions,
} from "@/lib/pdf-security";
import { useProtect } from "./ProtectContext";
import { useUnlock } from "./UnlockContext";
import { PdfFileCard } from "./PdfFileCard";
import { suffixedName } from "./securityFile";
import "./security.css";

export const PROTECT_ACCENT = "#9a3412";

/* ------------------------------------------------------------------ Canvas */

export function ProtectCanvas({ isDark, goToMode }: ModeSurfaceProps) {
  const { file, preview, loading, addFile, clear } = useProtect();
  const unlock = useUnlock();

  const onFiles = async (files: File[]) => {
    const result = await addFile(files[0]);
    if (result === "not-pdf") message.warning("Protect only takes PDFs.");
    if (result === "unreadable") message.error("That doesn't look like a PDF I can open.");
  };

  if (!file) {
    return (
      <DropZone
        title={loading ? "Opening your PDF…" : "Drop a PDF to protect"}
        blurb="Add a password so only people who know it can open the PDF. It is encrypted in your browser and never uploaded. Protect your PDF after you finish organizing or signing it."
        accepts={["PDF"]}
        accept="application/pdf,.pdf"
        multiple={false}
        onFiles={onFiles}
        buttonLabel="Select a PDF"
      />
    );
  }

  const alreadyProtected = file.lock !== "none";

  return (
    <div className="fb-sec" data-dark={isDark}>
      <PdfFileCard name={file.name} size={file.size} preview={preview} locked={alreadyProtected}>
        {alreadyProtected ? (
          <Alert
            type="warning"
            showIcon
            message="This PDF already has a password."
            description="Remove it in Unlock first, then protect the PDF again."
            action={
              <Button
                size="small"
                icon={<UnlockOutlined />}
                onClick={async () => {
                  const handoff = new File([file.bytes], file.name, { type: "application/pdf" });
                  await unlock.addFile(handoff);
                  goToMode("unlock");
                }}
              >
                Open in Unlock
              </Button>
            }
          />
        ) : (
          <Typography.Text type="secondary">
            Set a password in the panel, then download the protected PDF.
          </Typography.Text>
        )}
      </PdfFileCard>
      <Button icon={<ClearOutlined />} onClick={clear} className="fb-sec-another">
        Choose another PDF
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------- Panel */

export function ProtectPanel({ isDark }: ModeSurfaceProps) {
  const { file } = useProtect();

  return (
    <div data-dark={isDark}>
      <PanelHeader icon={<LockOutlined />} title="Protect PDF" accent={PROTECT_ACCENT} />
      {!file ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Drop a PDF to get started"
          style={{ marginTop: 24 }}
        />
      ) : file.lock !== "none" ? (
        <Typography.Paragraph type="secondary">
          This PDF already has a password. Remove it in Unlock before you set a new one.
        </Typography.Paragraph>
      ) : (
        // Keyed by file: a new PDF starts with empty password fields.
        <ProtectForm key={file.id} />
      )}
    </div>
  );
}

/** Restrictions start by allowing printing and form filling, the common case. */
const DEFAULT_RESTRICTED: PdfPermissions = {
  print: true,
  copy: false,
  edit: false,
  comment: false,
  fillForms: true,
};

const PERMISSION_LABELS: { key: keyof PdfPermissions; label: string }[] = [
  { key: "print", label: "Allow printing" },
  { key: "copy", label: "Allow copying text and images" },
  { key: "edit", label: "Allow editing" },
  { key: "comment", label: "Allow comments" },
  { key: "fillForms", label: "Allow filling forms" },
];

function ProtectForm() {
  const { file, clear } = useProtect();
  const [openPw, setOpenPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [restrict, setRestrict] = useState(false);
  const [perms, setPerms] = useState<PdfPermissions>(DEFAULT_RESTRICTED);
  const [ownerPw, setOwnerPw] = useState(generatePassword);
  const [busy, setBusy] = useState(false);

  const openError = openPw ? passwordProblem(openPw) : null;
  const mismatch = confirmPw.length > 0 && confirmPw !== openPw;
  const ownerError = restrict
    ? passwordProblem(ownerPw) ??
      (ownerPw === openPw
        ? "The permissions password must be different from the open password."
        : null)
    : null;
  const ready = openPw.length > 0 && !openError && confirmPw === openPw && !ownerError;

  const download = async () => {
    if (!file || !ready) return;
    setBusy(true);
    // Let the button paint its loading state before MuPDF loads and encrypts.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    try {
      const out = await protectPdf(file.bytes, {
        openPassword: openPw,
        // With no restrictions, a random permissions password nobody needs. It
        // must never be empty (an empty one lets some tools skip the password).
        ownerPassword: restrict ? ownerPw : generatePassword(),
        permissions: restrict ? perms : ALL_PERMISSIONS,
      });
      downloadBlob(
        new Blob([toArrayBuffer(out)], { type: "application/pdf" }),
        suffixedName(file.name, "protected"),
      );
      message.success("Protected PDF ready");
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      message.error(`Couldn't protect the PDF: ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Space direction="vertical" size={14} style={{ width: "100%" }}>
      <div className="fb-field">
        <span className="fb-field-label">Password</span>
        <Input.Password
          autoComplete="new-password"
          value={openPw}
          status={openError ? "error" : undefined}
          onChange={(e) => setOpenPw(e.target.value)}
        />
        {openError && <Typography.Text type="danger" className="fb-field-hint">{openError}</Typography.Text>}
      </div>

      <div className="fb-field">
        <span className="fb-field-label">Confirm password</span>
        <Input.Password
          autoComplete="new-password"
          value={confirmPw}
          status={mismatch ? "error" : undefined}
          onChange={(e) => setConfirmPw(e.target.value)}
        />
        {mismatch && (
          <Typography.Text type="danger" className="fb-field-hint">
            The passwords don't match.
          </Typography.Text>
        )}
      </div>

      <Alert
        type="warning"
        showIcon
        message="Anyone who opens this PDF will need the password."
        description="If the password is lost, the file can't be opened. Save it somewhere safe."
      />

      <Divider style={{ margin: "4px 0" }} />

      <div className="fb-sec-toggle">
        <Switch checked={restrict} onChange={setRestrict} id="fb-protect-restrict" />
        <label htmlFor="fb-protect-restrict" className="fb-field-label">
          Add restrictions
        </label>
      </div>
      <Typography.Text type="secondary" className="fb-field-hint">
        Restrictions ask PDF readers to block printing, copying or editing. Some readers ignore
        them. Only the password protects the file.
      </Typography.Text>

      {restrict && (
        <>
          <div className="fb-sec-perms">
            {PERMISSION_LABELS.map(({ key, label }) => (
              <Checkbox
                key={key}
                checked={perms[key]}
                onChange={(e) => setPerms((p) => ({ ...p, [key]: e.target.checked }))}
              >
                {label}
              </Checkbox>
            ))}
          </div>

          <div className="fb-field">
            <span className="fb-field-label">
              Permissions password{" "}
              <Typography.Text copyable={{ text: ownerPw }} className="fb-field-hint" />
            </span>
            <Space.Compact style={{ width: "100%" }}>
              <Input
                autoComplete="off"
                value={ownerPw}
                status={ownerError ? "error" : undefined}
                onChange={(e) => setOwnerPw(e.target.value)}
              />
              <Button
                icon={<ReloadOutlined />}
                aria-label="Generate a new permissions password"
                onClick={() => setOwnerPw(generatePassword())}
              />
            </Space.Compact>
            {ownerError ? (
              <Typography.Text type="danger" className="fb-field-hint">{ownerError}</Typography.Text>
            ) : (
              <Typography.Text type="secondary" className="fb-field-hint">
                Save this password too. Changing or removing the restrictions will require it.
              </Typography.Text>
            )}
          </div>
        </>
      )}

      <Divider style={{ margin: "4px 0" }} />

      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Button
          type="primary"
          size="large"
          icon={<DownloadOutlined />}
          block
          loading={busy}
          disabled={!ready}
          onClick={download}
        >
          Download protected PDF
        </Button>
        <Button icon={<ClearOutlined />} block danger onClick={clear} disabled={busy}>
          Start over
        </Button>
        <Typography.Text
          type="secondary"
          className="fb-text-fine"
          style={{ textAlign: "center", display: "block" }}
        >
          Encrypted in your browser. Your PDF is never uploaded.
        </Typography.Text>
      </Space>
    </Space>
  );
}
