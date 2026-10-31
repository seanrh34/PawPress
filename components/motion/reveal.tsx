"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

type RevealVariant = "up" | "tilt" | "draw" | "fade";

interface RevealProps {
  as?: ElementType;
  variant?: RevealVariant;
  /** Stagger delay in milliseconds. */
  delay?: number;
  /** Rotation used by the tilt variant (CSS angle). */
  tilt?: string;
  className?: string;
  "aria-labelledby"?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * Adds `.is-visible` once the element scrolls into view. The hidden starting
 * state only exists under `.js` (set by the inline head script), so the
 * server-rendered markup is fully visible without JavaScript.
 */
export function Reveal({ as: Tag = "div", variant = "up", delay = 0, tilt, className, style, children, "aria-labelledby": labelledBy }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Without IntersectionObserver the [data-js] hidden state would stick, so drop it.
    if (!("IntersectionObserver" in window)) {
      el.removeAttribute("data-reveal");
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const merged = {
    ...style,
    "--d": `${delay}ms`,
    ...(tilt ? { "--tilt": tilt } : {}),
  } as CSSProperties;

  return (
    <Tag ref={ref} aria-labelledby={labelledBy} data-reveal={variant} className={`${className ?? ""}${visible ? " is-visible" : ""}`.trim()} style={merged}>
      {children}
    </Tag>
  );
}
