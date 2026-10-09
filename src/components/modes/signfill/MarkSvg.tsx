import {
  CHECK_PATH,
  CHECK_VIEWBOX,
  CIRCLE_STROKE_PT,
  circleRadii,
  type MarkKind,
} from "@/lib/marks";

/**
 * MarkSvg: draws a checkmark or circle into a box of `width` x `height` display
 * pixels, from the same shape definitions the PDF exporter uses. The checkmark
 * is scaled uniformly and centered (the SVG default for a viewBox); the circle
 * is an outlined oval that fills the box.
 */
export function MarkSvg({
  kind,
  width,
  height,
  color,
  scale,
  className,
}: {
  kind: MarkKind;
  width: number;
  height: number;
  color: string;
  /** Display pixels per PDF point, so the circle's outline matches the export. */
  scale: number;
  className?: string;
}) {
  if (kind === "checkmark") {
    return (
      <svg
        className={className}
        width={width}
        height={height}
        viewBox={`0 0 ${CHECK_VIEWBOX} ${CHECK_VIEWBOX}`}
        aria-hidden
      >
        <path d={CHECK_PATH} fill={color} />
      </svg>
    );
  }
  const stroke = CIRCLE_STROKE_PT * scale;
  const { rx, ry } = circleRadii(width, height, stroke);
  return (
    <svg className={className} width={width} height={height} aria-hidden>
      <ellipse
        cx={width / 2}
        cy={height / 2}
        rx={rx}
        ry={ry}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
      />
    </svg>
  );
}
