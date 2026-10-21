import { Modal, Typography } from "antd";
import DeeBuiltCredit from "@/components/DeeBuiltCredit";

const { Paragraph, Title } = Typography;

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AboutModal({ open, onClose }: AboutModalProps) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} title="About File Builder">
      <Title level={5} style={{ marginTop: 0 }}>A free tool from DeeBuilt</Title>
      <Paragraph>
        File Builder bundles any pile of files into one clean, labeled ZIP.
        Drop them in, rename them, group them into folders, and download a tidy
        archive you can hand off.
      </Paragraph>
      <Paragraph>
        It also edits PDFs. Reorder or rotate pages, delete the ones you don't
        need, or merge several PDFs into one. Add a signature, type text, drop in
        a date, or cover and replace something that came out wrong.
      </Paragraph>
      <Paragraph>
        Everything runs in your browser. Your files never leave your machine and
        there's no account to sign up for, which is the whole point.
      </Paragraph>
      <DeeBuiltCredit />
    </Modal>
  );
}
