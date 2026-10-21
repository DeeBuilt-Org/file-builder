import { Modal, Typography } from "antd";
import DeeBuiltCredit from "@/components/DeeBuiltCredit";

const { Paragraph, Title } = Typography;

interface PrivacyModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PrivacyModal({ open, onClose }: PrivacyModalProps) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} title="Privacy">
      <Title level={5} style={{ marginTop: 0 }}>Your files never leave your device</Title>
      <Paragraph>
        File Builder runs entirely in your browser. The files you bundle, the
        PDFs you edit and sign, and everything you compress or convert stay in
        your tab while you work. Nothing is uploaded to a server.
      </Paragraph>
      <Paragraph>
        No cookies, no tracking, no analytics, no account required. The ZIP and
        the files you download are built in your browser and never leave your
        device until you share them.
      </Paragraph>
      <DeeBuiltCredit />
    </Modal>
  );
}
