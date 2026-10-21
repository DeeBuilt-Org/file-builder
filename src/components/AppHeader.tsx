import type { ReactNode } from "react";
import { FileZipOutlined } from "@ant-design/icons";
import "@/styles/header.css";

/**
 * AppHeader — File Builder's own sticky header: app mark + tool name on the
 * left, page controls (theme toggle) on the right. Colors come from the
 * --app-header-* variables in header.css, which flip with the html.dark class
 * ThemeProvider toggles.
 */
export default function AppHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="app-header">
      <div className="app-header__title">
        <FileZipOutlined className="app-header__mark" aria-hidden />
        <h1 className="app-header__name">File Builder</h1>
      </div>
      <div className="app-header__actions">{actions}</div>
    </header>
  );
}
