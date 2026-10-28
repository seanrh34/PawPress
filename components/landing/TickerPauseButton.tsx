'use client';

import { useRef, useState } from 'react';

/** 44px pause/play toggle sitting at the right end of the ink band. */
export default function TickerPauseButton() {
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const next = !paused;
    setPaused(next);
    ref.current?.closest('.marquee')?.classList.toggle('is-paused', next);
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      aria-pressed={paused}
      className="portal-button rounded-full border border-platform/40 bg-copy text-platform hover:bg-platform hover:text-copy"
      style={{ position: 'absolute', top: '50%', right: 'calc(4% + 0.75rem)', transform: 'translateY(-50%)', width: '2.75rem', height: '2.75rem', padding: 0, justifyContent: 'center', zIndex: 10 }}
    >
      <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
      <span className="sr-only">{paused ? 'Play ticker' : 'Pause ticker'}</span>
    </button>
  );
}
