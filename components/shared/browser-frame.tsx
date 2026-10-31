import Image from "next/image";
import type { CSSProperties } from "react";

interface BrowserFrameProps {
  src: string;
  alt: string;
  host: string;
  /** Resting tilt in degrees; straightens when an ancestor .app-card or .frame-hover is hovered. */
  rotate?: number;
  sizes?: string;
  priority?: boolean;
}

/** Mini browser chrome around a screenshot, cropped so the image edges never show. */
export function BrowserFrame({ src, alt, host, rotate = -1.5, sizes = "(max-width: 768px) 100vw, 50vw", priority }: BrowserFrameProps) {
  return (
    <div className="card-frame min-w-0 overflow-hidden rounded-xl border-2 border-copy bg-platform-raised" style={{ "--frame-rot": `${rotate}deg` } as CSSProperties}>
      <div className="flex min-w-0 items-center gap-3 border-b-2 border-copy bg-surface-subtle px-3 py-2" aria-hidden="true">
        <span className="flex shrink-0 gap-1.5">
          <span className="size-2.5 rounded-full bg-tomato" />
          <span className="size-2.5 rounded-full bg-butter" />
          <span className="size-2.5 rounded-full bg-sage" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded-full bg-platform-raised px-3 py-1 font-mono text-[0.6875rem] text-copy-muted">{host}</span>
      </div>
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-subtle">
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="scale-[1.25] object-cover" />
      </div>
    </div>
  );
}
