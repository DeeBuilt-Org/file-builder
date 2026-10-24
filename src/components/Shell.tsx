import { useState, type ReactNode } from "react";
import { Button, Layout, Space, Tooltip, Typography } from "antd";
import { SunOutlined, MoonOutlined } from "@ant-design/icons";
import AppHeader, { PackageMark } from "@/components/AppHeader";
import DeeBuiltCredit from "@/components/DeeBuiltCredit";
import { useThemeMode } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import AboutModal from "@/components/AboutModal";
import PrivacyModal from "@/components/PrivacyModal";

const { Content } = Layout;
const { Link, Text } = Typography;

/**
 * Shell — the chrome wrapper for File Builder: the app header
 * on top (chrome only — the theme toggle is the only control it carries) and the
 * full-bleed workspace as children.
 *
 * The family footer is NOT rendered as a full-width band here — it's handed to
 * the workspace via a render prop so the workspace can place it inside its RIGHT
 * column (beside the rail, not below it). That keeps the green rail owning the
 * whole left edge floor-to-ceiling with no gap beneath it. `children` is a
 * function that receives the footer node and returns the workspace.
 */
export default function Shell({
  children,
}: {
  children: (footer: ReactNode) => ReactNode;
}) {
  const { mode, toggle } = useThemeMode();
  const isDark = mode === "dark";
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const headerExtras = (
    <Tooltip title={isDark ? "Light mode" : "Dark mode"}>
      <Button
        type="text"
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        icon={isDark ? <SunOutlined /> : <MoonOutlined />}
        onClick={() => {
          haptic("tap");
          toggle();
        }}
        className="app-header__btn"
      />
    </Tooltip>
  );

  const footer = (
    <div className="fb-credit">
      <Space size={8} wrap className="fb-credit__links">
        <Link onClick={() => setAboutOpen(true)}>About</Link>
        <Text type="secondary">·</Text>
        <Link onClick={() => setPrivacyOpen(true)}>Privacy</Link>
        <Text type="secondary">·</Text>
        <DeeBuiltCredit />
      </Space>
    </div>
  );

  return (
    // The app is locked to the viewport height and the document body never
    // scrolls (overflow: hidden). The header sits at the top; the workspace
    // fills the rest and owns ALL scrolling internally — so the rail, anchored
    // directly under the header, can never move.
    <Layout
      style={{
        height: "100vh",
        overflow: "hidden",
        background: isDark ? "#0b0f17" : "#eef1f6",
      }}
    >
      <AppHeader mark={<PackageMark />} name="File Builder" actions={headerExtras} />

      {/* Full-bleed workspace: no padding, no max-width. flex:1 + min-height:0
          lets it fill the space below the header and scroll inside. The footer
          is passed to the workspace so it sits in the right column, not below
          the rail. */}
      <Content style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {children(footer)}
      </Content>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <PrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </Layout>
  );
}
