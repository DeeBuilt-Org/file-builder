import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exactPlacement, type FillFocus, type FillMode } from "@/lib/image-ops";
import "./image.css";

/**
 * ExactFillPreview — a live, draggable preview of an exact-size render.
 *
 * The box you see IS the output box, at the real target aspect ratio, scaled to
 * fit the panel. The image inside is positioned with the SAME `exactPlacement`
 * math the encoder runs, so what you drag is what you get — the preview and the
 * downloaded file can't drift apart.
 *
 * Dragging sets the focus point (0–1 on each axis). Only the overflowing axis can
 * move, which is the honest behavior: if the height fits exactly there is no
 * vertical slack to pan through, so vertical drags do nothing and the cursor says
 * so. Arrow keys nudge for fine adjustment once focused.
 */

/** Fraction of the box a single arrow-key press moves the image. */
const NUDGE = 0.02;

interface Props {
  /** Source image preview URL (an object URL from the working set). */
  src: string;
  /** Natural pixel size of the source. */
  natW: number;
  natH: number;
  /** Exact output size being targeted. */
  targetW: number;
  targetH: number;
  fill: FillMode;
  focus: FillFocus;
  onFocusChange: (focus: FillFocus) => void;
  /** Painted behind the image — the pad color, or "transparent" for a checkerboard. */
  background: string;
  /** Longest edge of the preview box in CSS px. */
  maxEdge?: number;
}

export function ExactFillPreview({
  src,
  natW,
  natH,
  targetW,
  targetH,
  fill,
  focus,
  onFocusChange,
  background,
  maxEdge = 260,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Scale the real target box down to something that fits the panel, preserving
  // the exact output aspect ratio so the framing you see is truthful.
  const box = useMemo(() => {
    const scale = Math.min(maxEdge / targetW, maxEdge / targetH, 1);
    return { w: Math.round(targetW * scale), h: Math.round(targetH * scale) };
  }, [targetW, targetH, maxEdge]);

  // Same geometry as the encoder, expressed in preview-box pixels.
  const place = useMemo(
    () => exactPlacement(natW, natH, box.w, box.h, fill, focus),
    [natW, natH, box.w, box.h, fill, focus],
  );

  // How much slack exists on each axis, in the ORIGINAL target space — this is
  // what decides whether an axis is draggable at all.
  const real = useMemo(
    () => exactPlacement(natW, natH, targetW, targetH, fill, focus),
    [natW, natH, targetW, targetH, fill, focus],
  );
  const canDragX = fill !== "stretch" && Math.abs(real.dw - targetW) > 0.5;
  const canDragY = fill !== "stretch" && Math.abs(real.dh - targetH) > 0.5;
  const draggable = canDragX || canDragY;

  /**
   * Convert a pointer position into a focus fraction. The mapping is based on the
   * SLACK, not the box: moving the pointer across the full box should traverse the
   * full range of possible framings, so we divide the pointer delta by the slack.
   * Grab-anywhere semantics — we track movement from where the drag started.
   */
  const dragState = useRef<{ startX: number; startY: number; from: FillFocus } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, from: focus };
    setDragging(true);
  };

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const st = dragState.current;
      if (!st) return;
      // Slack in preview px; guard against a zero divisor on a fitting axis.
      const slackX = Math.abs(place.dw - box.w);
      const slackY = Math.abs(place.dh - box.h);
      // Dragging the image right should reveal what's on its left, so the focus
      // fraction moves opposite the pointer for crop (negative slack) and with it
      // for pad. Using the signed slack handles both without a branch.
      const signX = place.dw > box.w ? -1 : 1;
      const signY = place.dh > box.h ? -1 : 1;
      const dxFrac = slackX > 0.5 ? ((e.clientX - st.startX) / slackX) * signX : 0;
      const dyFrac = slackY > 0.5 ? ((e.clientY - st.startY) / slackY) * signY : 0;
      onFocusChange({
        x: canDragX ? clamp(st.from.x + dxFrac) : st.from.x,
        y: canDragY ? clamp(st.from.y + dyFrac) : st.from.y,
      });
    },
    [place.dw, place.dh, box.w, box.h, canDragX, canDragY, onFocusChange],
  );

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragState.current = null;
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!draggable) return;
    const step =
      e.key === "ArrowLeft" || e.key === "ArrowUp" ? -NUDGE : e.key === "ArrowRight" || e.key === "ArrowDown" ? NUDGE : 0;
    if (!step) return;
    e.preventDefault();
    const horizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
    if (horizontal && !canDragX) return;
    if (!horizontal && !canDragY) return;
    onFocusChange({
      x: horizontal ? clamp(focus.x + step) : focus.x,
      y: horizontal ? focus.y : clamp(focus.y + step),
    });
  };

  // Reset the cursor if the mode changes out from under an in-flight drag.
  useEffect(() => {
    if (!draggable) {
      dragState.current = null;
      setDragging(false);
    }
  }, [draggable]);

  const transparent = background === "transparent" || background === "none";

  return (
    <div className="fb-exact-preview">
      <div
        ref={boxRef}
        className="fb-exact-box"
        data-checker={transparent ? "on" : undefined}
        data-drag={draggable ? (dragging ? "active" : "idle") : "off"}
        style={{
          width: box.w,
          height: box.h,
          background: transparent ? undefined : background,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => draggable && onFocusChange({ x: 0.5, y: 0.5 })}
        tabIndex={draggable ? 0 : -1}
        role={draggable ? "slider" : undefined}
        aria-label={draggable ? "Drag to reposition the image inside the crop" : undefined}
        aria-valuetext={
          draggable ? `Horizontal ${Math.round(focus.x * 100)}%, vertical ${Math.round(focus.y * 100)}%` : undefined
        }
      >
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: place.dx,
            top: place.dy,
            width: place.dw,
            height: place.dh,
            // The preview must never be resampled differently than the encoder;
            // object-fit is deliberately avoided — the rect IS the geometry.
            maxWidth: "none",
            maxHeight: "none",
            userSelect: "none",
          }}
        />
        {/* Rule-of-thirds guides, only while actively dragging a crop. */}
        {dragging && fill === "crop" && (
          <>
            <span className="fb-exact-guide" style={{ left: "33.333%" }} />
            <span className="fb-exact-guide" style={{ left: "66.667%" }} />
            <span className="fb-exact-guide" data-h style={{ top: "33.333%" }} />
            <span className="fb-exact-guide" data-h style={{ top: "66.667%" }} />
          </>
        )}
      </div>
      <div className="fb-exact-caption">
        {fill === "stretch"
          ? "Stretched to fit — the image is distorted."
          : draggable
            ? "Drag to reposition · double-click to center"
            : fill === "crop"
              ? "Exact match — nothing to trim."
              : "Exact match — no bars needed."}
      </div>
    </div>
  );
}

function clamp(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
