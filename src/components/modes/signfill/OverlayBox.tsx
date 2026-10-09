import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { CloseOutlined, CopyOutlined } from "@ant-design/icons";
import { useSignFill, type OverlayElement } from "./SignFillContext";
import { getFontOption, loadFontForPreview } from "@/lib/pdf-fonts";
import { MarkSvg } from "./MarkSvg";
import { MARK_SIZE_MIN, TEXT_SIZE_MIN, fontSizeForBoxHeight, textBoxHeight } from "./sizing";

/**
 * OverlayBox — one placed element (text / signature image / white-out / check /
 * circle) floating over a rendered page. Handles drag-to-move and corner-resize
 * in DISPLAY pixels, converting to/from PDF points via `scale` so the stored
 * model stays resolution-independent. It's plain DOM on top of the page image —
 * the exact "HTML overlay layer" the plan describes; `applyOverlay` bakes it
 * into the PDF on save.
 */
export function OverlayBox({
  el,
  scale,
}: {
  el: OverlayElement;
  scale: number;
}) {
  const { updateElement, removeElement, duplicateElement, selectedId, setSelectedId } =
    useSignFill();
  const dragState = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const selected = selectedId === el.id;

  // When this element uses a library font, inject its stylesheet so the on-screen
  // preview renders in that font (idempotent per family).
  useEffect(() => {
    if (el.fontFamily) loadFontForPreview(el.fontFamily);
  }, [el.fontFamily]);

  const onPointerDown = (e: ReactPointerEvent, mode: "move" | "resize") => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(el.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
      origW: el.width,
      origH: el.height,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const ds = dragState.current;
    if (!ds) return;
    const dx = (e.clientX - ds.startX) / scale;
    const dy = (e.clientY - ds.startY) / scale;
    if (ds.mode === "move") {
      updateElement(el.id, { x: ds.origX + dx, y: ds.origY + dy });
    } else if (el.kind === "checkmark") {
      // A checkmark is never stretched, so its box stays square: the box you
      // see is exactly the space the mark fills on screen and in the PDF.
      const side = Math.max(MARK_SIZE_MIN, Math.max(ds.origW + dx, ds.origH + dy));
      updateElement(el.id, { width: side, height: side });
    } else if (el.kind === "circle") {
      updateElement(el.id, {
        width: Math.max(MARK_SIZE_MIN, ds.origW + dx),
        height: Math.max(MARK_SIZE_MIN, ds.origH + dy),
      });
    } else {
      const width = Math.max(16, ds.origW + dx);
      const height = Math.max(textBoxHeight(TEXT_SIZE_MIN), ds.origH + dy);
      // For text, keep the font size roughly tied to the box height so resizing
      // scales the type as you'd expect.
      const patch: Partial<OverlayElement> = { width, height };
      if (el.kind === "text") {
        patch.fontSize = fontSizeForBoxHeight(height);
      }
      updateElement(el.id, patch);
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    dragState.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be gone */
    }
  };

  const left = el.x * scale;
  const top = el.y * scale;
  const width = el.width * scale;
  const height = el.height * scale;

  const colorCss = el.color
    ? `rgb(${Math.round(el.color.r * 255)}, ${Math.round(el.color.g * 255)}, ${Math.round(el.color.b * 255)})`
    : "#111";

  return (
    <div
      className="fb-ob"
      data-selected={selected}
      data-kind={el.kind}
      style={{ left, top, width, height }}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      // Stop the synthetic click that follows pointerup from bubbling to the
      // page background, whose onClick clears the selection — otherwise the
      // element deselects the instant you release it (and the "Remove this"
      // button in the panel vanishes before you can use it).
      onClick={(e) => e.stopPropagation()}
      role="button"
      tabIndex={0}
    >
      {el.kind === "signature" && el.imgDataUrl && (
        <img className="fb-ob-img" src={el.imgDataUrl} alt="signature" draggable={false} />
      )}

      {(el.kind === "checkmark" || el.kind === "circle") && (
        <MarkSvg
          className="fb-ob-mark"
          kind={el.kind}
          width={width}
          height={height}
          color={colorCss}
          scale={scale}
        />
      )}

      {el.kind === "text" && (
        <span
          className="fb-ob-text"
          style={{
            fontSize: (el.fontSize ?? 16) * scale,
            color: colorCss,
            // A background fill (usually white) is how you cover-and-replace:
            // the box hides whatever's under it while the text sits on top.
            background: el.bg
              ? `rgb(${Math.round(el.bg.r * 255)}, ${Math.round(el.bg.g * 255)}, ${Math.round(el.bg.b * 255)})`
              : "transparent",
            // A library font (if chosen) renders here via its injected
            // stylesheet; otherwise the base sans-serif.
            fontFamily: el.fontFamily
              ? getFontOption(el.fontFamily).css
              : "Helvetica, Arial, sans-serif",
            fontWeight: el.fontWeight ?? 400,
          }}
        >
          {el.text}
        </span>
      )}

      {selected && (
        <>
          <div className="fb-ob-actions" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="fb-ob-act"
              title="Duplicate (Ctrl+D)"
              onClick={(e) => {
                e.stopPropagation();
                duplicateElement(el.id);
              }}
            >
              <CopyOutlined />
            </button>
            <button
              type="button"
              className="fb-ob-act"
              title="Remove"
              onClick={(e) => {
                e.stopPropagation();
                removeElement(el.id);
              }}
            >
              <CloseOutlined />
            </button>
          </div>
          <span
            className="fb-ob-resize"
            onPointerDown={(e) => onPointerDown(e, "resize")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </>
      )}
    </div>
  );
}
