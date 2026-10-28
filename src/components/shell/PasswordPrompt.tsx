import { useState } from "react";
import { Alert, Button, Input, Space, Typography } from "antd";
import { LockOutlined } from "@ant-design/icons";
import type { PdfLock } from "@/lib/pdf-security";

/**
 * PasswordPrompt — the one "enter this PDF's password" form. Shared primitive:
 * the Unlock mode renders it inline, and the unlock gate (Organize, Sign & Fill)
 * renders it in a modal. The caller does the checking; this only collects the
 * password and shows the result.
 */
export function PasswordPrompt({
  lock,
  fileName,
  onSubmit,
  onCancel,
  submitLabel = "Unlock",
}: {
  lock: Exclude<PdfLock, "none">;
  fileName: string;
  /** Resolve `true` when the password was accepted, `false` when it was wrong. */
  onSubmit: (password: string) => Promise<boolean>;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setWrong(false);
    try {
      const ok = await onSubmit(password);
      if (!ok) setWrong(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fb-pw">
      <Typography.Title level={4} className="fb-pw-title">
        <LockOutlined />{" "}
        {lock === "open" ? "This PDF is password-protected" : "This PDF has restrictions"}
      </Typography.Title>
      <Typography.Paragraph type="secondary" className="fb-pw-body">
        {lock === "open" ? (
          <>
            Enter the password for <strong>{fileName}</strong>.
          </>
        ) : (
          <>
            <strong>{fileName}</strong> limits printing, copying or editing. Enter its permissions
            password to unlock it.
          </>
        )}
      </Typography.Paragraph>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input.Password
          size="large"
          autoFocus
          autoComplete="current-password"
          placeholder={lock === "open" ? "Password" : "Permissions password"}
          value={password}
          status={wrong ? "error" : undefined}
          onChange={(e) => {
            setPassword(e.target.value);
            setWrong(false);
          }}
        />
        {wrong && (
          <Alert type="error" showIcon message="The password is incorrect." className="fb-pw-error" />
        )}
        <Space className="fb-pw-actions">
          {onCancel && (
            <Button onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button type="primary" htmlType="submit" loading={busy} disabled={!password}>
            {submitLabel}
          </Button>
        </Space>
      </form>
    </div>
  );
}
