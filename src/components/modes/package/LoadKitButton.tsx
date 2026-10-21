import { useRef } from "react";
import { Button, message } from "antd";
import { AppstoreAddOutlined } from "@ant-design/icons";
import { usePackage } from "./PackageContext";
import { parseOpsetteKit } from "./opsetteKit";

/**
 * "Load a brand kit" — the payoff of the kit interop system. Pick a single
 * `.brand-kit.json` (or older `.opsette-kit.json`) saved from Brand Board and it
 * pre-fills the
 * bundler's file list with every asset it carries (logo, QR, digital card,
 * signature HTML, social banners/icons), each already named and foldered.
 *
 * It's an accelerant on top of the agnostic bundler: it just seeds normal rows
 * you can still rename, move, or remove. Manual drops keep working alongside it.
 */
export function LoadKitButton({
  type = "default",
  block = false,
}: {
  type?: "default" | "primary" | "text" | "link" | "dashed";
  block?: boolean;
}) {
  const { addPreparedFiles } = usePackage();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch {
      message.error("Couldn't read that file.");
      return;
    }
    const result = await parseOpsetteKit(text);
    if (result.error) {
      message.warning(result.error);
      return;
    }
    addPreparedFiles(result.files);
    const who = result.kitLabel ? `${result.kitLabel} kit` : "kit";
    message.success(
      `Loaded ${result.files.length} file${result.files.length === 1 ? "" : "s"} from the ${who}.`,
    );
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <Button
        type={type}
        block={block}
        icon={<AppstoreAddOutlined />}
        onClick={(e) => {
          // In the empty state this button sits inside the DropZone, whose own
          // container onClick also opens a file picker. Stop the bubble so only
          // OUR kit picker opens (otherwise the two dialogs fight each other).
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        Load a brand kit
      </Button>
    </>
  );
}
