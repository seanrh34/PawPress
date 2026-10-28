'use client';

import { useRef, useState } from 'react';

/** 44px pause/play toggle for the marquee; sets .is-paused on the nearest .marquee band. */
export default function TickerPauseButton() {
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const next = !paused;
    setPaused(next);
    ref.current?.closest('.marquee')?.classList.toggle('is-paused', next);
  };

  return (
    <span className="absolute right-4 top-1/2 z-10 -translate-y-1/2">
      <button
        ref={ref}
        type="button"
        onClick={toggle}
        aria-pressed={paused}
        className="portal-button portal-button-secondary rounded-full"
      >
        <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
        <span className="sr-only">{paused ? 'Play ticker' : 'Pause ticker'}</span>
      </button>
    </span>
  );
}
