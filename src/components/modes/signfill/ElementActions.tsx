import { Button, Space } from "antd";
import { ClearOutlined, CopyOutlined } from "@ant-design/icons";
import { useSignFill } from "./SignFillContext";

/** Duplicate + Remove for the selected element, shared by every element kind. */
export function ElementActions({ id }: { id: string }) {
  const { duplicateElement, removeElement } = useSignFill();
  return (
    <Space size={8} wrap style={{ marginTop: 10 }}>
      <Button size="small" icon={<CopyOutlined />} onClick={() => duplicateElement(id)}>
        Duplicate
      </Button>
      <Button danger size="small" icon={<ClearOutlined />} onClick={() => removeElement(id)}>
        Remove this
      </Button>
    </Space>
  );
}
