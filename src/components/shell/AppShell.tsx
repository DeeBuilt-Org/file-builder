import type { ReactNode } from "react";
import { MODES, MODE_MAP, type ModeId } from "@/lib/modes";
import { haptic } from "@/lib/haptics";
import "./shell.css";

/**
 * AppShell — the Smallpdf-shaped workspace, laid out as:
 *
 *   [ rail | ( canvas + panel )  ]
 *          [       footer        ]
 *
 * The rail owns the ENTIRE left edge, floor to ceiling (header-bottom to
 * viewport-bottom) — it is a sibling of a right COLUMN that stacks the workspace
 * over the footer. So the footer only spans the canvas+panel width and there is
 * never a gap or gray strip below the green rail.
 *
 * It owns none of the mode logic — it lays out the frame and hands each mode its
 * two surfaces. Adding a mode never touches this file.
 */
export function AppShell({
  activeMode,
  onModeChange,
  isDark,
  footer,
}: {
  activeMode: ModeId;
  onModeChange: (id: ModeId) => void;
  isDark: boolean;
  footer: ReactNode;
}) {
  const mode = MODE_MAP[activeMode];
  const { Canvas, Panel } = mode;

  return (
    <div className="fb-shell" data-fb-theme={isDark ? "dark" : "light"}>
      <nav className="fb-rail" aria-label="Tools">
        {MODES.map((m, i) => {
          const active = m.id === activeMode;
          // A divider opens each new rail cluster (file utilities vs. PDF
          // editing). Group defaults to "file"; the divider appears whenever the
          // group changes from the previous mode.
          const group = m.group ?? "file";
          const prevGroup = i > 0 ? MODES[i - 1].group ?? "file" : group;
          const showDivider = i > 0 && group !== prevGroup;
          return (
            <div key={m.id} className="fb-rail-slot">
              {showDivider && (
                <div className="fb-rail-divider" role="separator" aria-label="PDF tools">
                  <span className="fb-rail-divider-label">PDF</span>
                </div>
              )}
              <button
                type="button"
                className="fb-rail-item"
                data-active={active}
                aria-current={active ? "true" : undefined}
                title={m.blurb}
                style={
                  active
                    ? ({ "--fb-accent": m.accent } as React.CSSProperties)
                    : undefined
                }
                onClick={() => {
                  if (m.id !== activeMode) {
                    haptic("tap");
                    onModeChange(m.id);
                  }
                }}
              >
                <span className="fb-rail-icon">{m.icon}</span>
                <span className="fb-rail-label">{m.label}</span>
                {!m.ready && <span className="fb-rail-soon">soon</span>}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Center column: canvas on top, footer tucked beneath it. Both the rail
          (left) and the panel (right) are full-height siblings of THIS column,
          so both side columns run floor-to-ceiling and the footer sits only
          under the canvas — no short edge on either side. */}
      <div className="fb-center">
        <section className="fb-canvas">
          <div className="fb-canvas-inner">
            <Canvas isDark={isDark} goToMode={onModeChange} />
          </div>
        </section>
        <div className="fb-footer">{footer}</div>
      </div>

      <aside className="fb-panel" aria-label={`${mode.label} options`}>
        <Panel isDark={isDark} goToMode={onModeChange} />
      </aside>
    </div>
  );
}
