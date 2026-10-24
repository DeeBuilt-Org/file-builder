import type { ReactNode } from "react";
import "@/styles/header.css";

/**
 * AppHeader: the sticky header lockup. The mark in a colored tile, then the
 * tool name in the display face; page-level controls (theme toggle) on the
 * right.
 *
 * Copied from Decision Lab's lockup (the DeeBuilt tools design system in
 * opsette-tools.github.io/docs/DEEBUILT-TOOLS-MIGRATION.md). File Builder's
 * rail is always visible, so the header carries no nav toggle.
 */
export default function AppHeader({
  mark,
  name,
  actions,
}: {
  /** An icon drawn in currentColor; it renders white on the tile. */
  mark: ReactNode;
  name: string;
  actions?: ReactNode;
}) {
  return (
    <header className="app-header">
      <div className="app-header__lockup">
        <span className="app-header__tile" aria-hidden="true">
          {mark}
        </span>
        <h1 className="app-header__name">{name}</h1>
      </div>
      <div className="app-header__actions">{actions}</div>
    </header>
  );
}

/** File Builder's mark: the package box from its favicon, in currentColor. */
export function PackageMark() {
  return (
    <svg viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth={24} strokeLinecap="round" strokeLinejoin="round">
      <line x1="128" y1="129.09" x2="128" y2="231.97" />
      <polyline points="32.7 76.92 128 129.08 223.3 76.92" />
      <path d="M219.84,182.84l-88,48.18a8,8,0,0,1-7.68,0l-88-48.18a8,8,0,0,1-4.16-7V80.18a8,8,0,0,1,4.16-7l88-48.18a8,8,0,0,1,7.68,0l88,48.18a8,8,0,0,1,4.16,7v95.64A8,8,0,0,1,219.84,182.84Z" />
      <polyline points="81.56 48.31 176 100 176 152" />
    </svg>
  );
}
