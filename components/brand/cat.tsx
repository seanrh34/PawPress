"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const ink = "var(--text)";
const paper = "var(--surface)";

interface CatProps {
  className?: string;
  /** Pupils follow the cursor on fine pointers. */
  track?: boolean;
  /** Fixed gaze, -1..1 on each axis. Used when track is off (e.g. the 404 page). */
  look?: { x: number; y: number };
  /** Hold the tail still (e.g. a confused cat). */
  still?: boolean;
}

/** Pointer-following gaze, shared by both cats. Writes --lx/--ly on the svg. */
function useGaze(ref: React.RefObject<SVGSVGElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduce.matches) return;
    let raf = 0;
    let ev: PointerEvent | null = null;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el || !ev) return;
      const r = el.getBoundingClientRect();
      const dx = ev.clientX - (r.left + r.width / 2);
      const dy = ev.clientY - (r.top + r.height * 0.45);
      const dist = Math.hypot(dx, dy) || 1;
      const k = Math.min(dist / 160, 1);
      el.style.setProperty("--lx", ((dx / dist) * k).toFixed(3));
      el.style.setProperty("--ly", ((dy / dist) * k).toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      ev = e;
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled, ref]);
}

/** The 34cats cat: a line-drawn loaf with a swaying tail, blinking eyes and following pupils. */
export function Cat({ className, track = true, look, still = false }: CatProps) {
  const ref = useRef<SVGSVGElement>(null);
  useGaze(ref, track);
  const style = look ? ({ "--lx": look.x, "--ly": look.y } as CSSProperties) : undefined;
  const line = { stroke: ink, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

  return (
    <svg ref={ref} viewBox="0 12 160 122" className={`${still ? "cat-still " : ""}${className ?? ""}`} style={style} aria-hidden="true" focusable="false" overflow="visible">
      {/* tail, behind the body */}
      <g className="cat-tail">
        <path d="M128 118 C150 122 160 102 151 88 C146 80 151 72 158 76" fill="none" {...line} />
      </g>
      {/* body */}
      <path d="M30 126 C20 104 34 80 64 80 L98 80 C128 80 142 104 132 126 Z" fill={paper} {...line} />
      {/* ears */}
      <path d="M50 52 L50 17 L79 37 Z" fill={paper} {...line} />
      <path d="M110 52 L110 17 L81 37 Z" fill={paper} {...line} />
      <path d="M56 42 L56 27 L69 36 Z" fill="var(--accent)" opacity="0.4" />
      <path d="M104 42 L104 27 L91 36 Z" fill="var(--accent)" opacity="0.4" />
      {/* head */}
      <ellipse cx="80" cy="60" rx="35" ry="28" fill={paper} {...line} />
      {/* cheeks */}
      <ellipse cx="57" cy="72" rx="6" ry="3.5" fill="var(--accent)" opacity="0.3" />
      <ellipse cx="103" cy="72" rx="6" ry="3.5" fill="var(--accent)" opacity="0.3" />
      {/* eyes: the group blinks, the dot looks */}
      {[66, 94].map((cx, i) => (
        <g key={cx} className={`cat-eyes ${i ? "cat-eyes-r" : ""}`}>
          <g className="cat-pupil">
            <circle cx={cx} cy="60" r="5.4" fill={ink} />
            <circle cx={cx + 1.8} cy="58" r="1.7" fill={paper} />
          </g>
        </g>
      ))}
      {/* nose and mouth */}
      <path d="M76 67.5 H84 L80 72.5 Z" fill="var(--accent)" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M80 73 V75.5 M80 75.5 Q75 80.5 70 76.5 M80 75.5 Q85 80.5 90 76.5" fill="none" {...line} strokeWidth="2" />
      {/* whiskers */}
      <path d="M52 66 L31 61 M52 71 L31 74 M108 66 L129 61 M108 71 L129 74" fill="none" {...line} strokeWidth="1.8" />
      {/* front paws */}
      <ellipse cx="62" cy="124.5" rx="11" ry="6.5" fill={paper} {...line} />
      <ellipse cx="98" cy="124.5" rx="11" ry="6.5" fill={paper} {...line} />
      <path d="M59 123 V127 M65 123 V127 M95 123 V127 M101 123 V127" fill="none" {...line} strokeWidth="1.6" />
    </svg>
  );
}

/** A second cat that peeks over a ledge; its ears twitch once it scrolls into view. */
export function PeekingCat({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [awake, setAwake] = useState(false);
  useGaze(ref, true);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAwake(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const line = { stroke: ink, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

  return (
    <svg ref={ref} viewBox="0 0 150 72" className={`peek ${className ?? ""}`} data-awake={awake} aria-hidden="true" focusable="false" overflow="visible">
      <path data-ear="l" d="M27 50 L27 9 L61 31 Z" fill={paper} {...line} />
      <path data-ear="r" d="M123 50 L123 9 L89 31 Z" fill={paper} {...line} />
      <path d="M20 73 C17 44 40 27 75 27 C110 27 133 44 130 73 Z" fill={paper} stroke="none" />
      <path d="M20 73 C17 44 40 27 75 27 C110 27 133 44 130 73" fill="none" {...line} />
      {[56, 94].map((cx) => (
        <g key={cx} className="cat-eyes">
          <g className="cat-pupil">
            <circle cx={cx} cy="50" r="5.2" fill={ink} />
            <circle cx={cx + 1.7} cy="48" r="1.6" fill={paper} />
          </g>
        </g>
      ))}
      <path d="M71.5 57.5 H78.5 L75 62 Z" fill="var(--accent)" stroke="var(--accent)" strokeWidth="1.4" strokeLinejoin="round" />
      {/* paws gripping the ledge */}
      <path d="M33 73 V67 a8.5 8.5 0 0 1 17 0 V73" fill={paper} {...line} />
      <path d="M100 73 V67 a8.5 8.5 0 0 1 17 0 V73" fill={paper} {...line} />
    </svg>
  );
}

/** A curled-up sleeping cat for the call-to-action block. Colours follow the CTA block. */
export function SleepingCat({ className }: { className?: string }) {
  const fg = "var(--cta-fg)";
  const bg = "var(--cta-bg)";
  const line = { stroke: fg, strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 200 112" className={className} aria-hidden="true" focusable="false" overflow="visible">
      <g className="sleep-breathe">
        {/* curled body */}
        <path d="M14 106 C4 72 40 40 104 40 C168 40 198 72 188 106 Z" fill={bg} {...line} />
        {/* ears */}
        <path d="M34 62 L32 34 L58 50 Z" fill={bg} {...line} />
        <path d="M82 52 L90 26 L102 56 Z" fill={bg} {...line} />
        {/* head tucked on the paws */}
        <ellipse cx="62" cy="76" rx="32" ry="26" fill={bg} {...line} />
        {/* closed eyes */}
        <path d="M44 76 q7 7 14 0 M68 76 q7 7 14 0" fill="none" {...line} strokeWidth="2.4" />
        <path d="M60.5 85 H68.5 L64.5 89.5 Z" fill="var(--accent)" stroke="var(--accent)" strokeWidth="1.4" strokeLinejoin="round" />
        {/* tail wrapped around the front */}
        <path d="M186 98 C190 112 150 114 118 105 C104 101 100 94 108 92" fill="none" {...line} />
        {/* back haunch line */}
        <path d="M132 58 C158 62 172 80 166 100" fill="none" {...line} strokeWidth="2" opacity="0.6" />
      </g>
    </svg>
  );
}
