import { Typography } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import type { ModeSurfaceProps } from "@/lib/modes";

const { Title, Text } = Typography;

/**
 * The honest placeholder for a rail entry we haven't built yet. The plan is
 * explicit: never ship a mode that fakes doing something. A "coming soon" tile
 * keeps the rail reading like the full suite from day one without pretending a
 * capability exists.
 */
export function ComingSoonCanvas({ isDark }: ModeSurfaceProps) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        textAlign: "center",
        padding: 24,
      }}
    >
      <ClockCircleOutlined
        className="fb-icon-xl"
        style={{ color: isDark ? "#5a6b66" : "#b7c2be" }}
      />
      <Title level={4} style={{ margin: 0, color: isDark ? "#e6e6e6" : undefined }}>
        This tool is on the way
      </Title>
      <Text type="secondary" style={{ maxWidth: 380 }}>
        We're building this one honestly, so it ships when it actually works.
        For now, try Bundle to zip files, or the Organize and Sign &amp; Fill
        tools to work on a PDF.
      </Text>
    </div>
  );
}

export function ComingSoonPanel({ isDark }: ModeSurfaceProps) {
  return (
    <div style={{ padding: "4px 2px" }}>
      <Text type="secondary" className="fb-text-caption" style={{ color: isDark ? "#9aa7a2" : undefined }}>
        Options for this tool will appear here once it's live.
      </Text>
    </div>
  );
}
