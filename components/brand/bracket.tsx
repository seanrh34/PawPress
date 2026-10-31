import type { CSSProperties } from "react";

interface BracketProps {
  /** "open" is the logo square with a gap on the right; "corner" is a single top-left corner. */
  shape?: "open" | "corner";
  className?: string;
  strokeWidth?: number;
  stroke?: string;
  /** Fill painted inside the open square (the gap is closed straight across). */
  fill?: string;
  /** Draw itself on mount. Without it the bracket is simply drawn. */
  animate?: boolean;
  /** Delay before the draw starts, in ms. */
  delay?: number;
  /** Draw when the nearest <Reveal variant="draw"> ancestor scrolls into view. */
  drawOnView?: boolean;
}

const paths = {
  open: "M96 38 V4 H4 V96 H96 V62",
  corner: "M4 44 V4 H44",
} as const;

/** The 34cats motif: a square bracket that can draw itself. */
export function Bracket({ shape = "open", className, strokeWidth = 5, stroke = "var(--accent)", fill, animate = false, delay = 150, drawOnView = false }: BracketProps) {
  return (
    <svg
      viewBox={shape === "open" ? "0 0 100 100" : "0 0 48 48"}
      className={`bracket ${animate ? "bracket-anim" : ""} ${className ?? ""}`.trim()}
      style={{ "--bracket-delay": `${delay}ms` } as CSSProperties}
      fill="none"
      aria-hidden="true"
      overflow="visible"
    >
      {fill && shape === "open" && <path d={paths.open} fill={fill} stroke="none" pathLength={1} className="bracket-fill" style={{ strokeDasharray: "none" }} />}
      <path d={paths[shape]} className={drawOnView ? "draw-on-view" : undefined} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
    </svg>
  );
}
