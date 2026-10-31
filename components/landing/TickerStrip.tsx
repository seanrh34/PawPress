import TickerPauseButton from './TickerPauseButton';

export default function TickerStrip({ names }: { names: string[] }) {
  const items = Array.from(
    new Set([...names, 'PawPress', 'Next.js', 'Lexical', 'Supabase', 'pawpress CLI', 'Markdown']),
  );
  // Two repeats per half so a half is always wider than a large viewport.
  const half = [...items, ...items];

  const renderHalf = (dup: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={dup || undefined} {...(dup ? { 'data-dup': '' } : {})}>
      {half.map((item, i) => (
        <li key={i} className="flex items-center whitespace-nowrap font-mono text-sm uppercase tracking-[0.08em]">
          <span className="px-5">{item}</span>
          <span className="text-tomato" aria-hidden="true">✦</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="relative overflow-hidden py-4 md:py-8" role="region" aria-label="Topics and tools">
      <div className="marquee relative -mx-[4%] w-[108%] -rotate-[1.5deg] bg-copy py-3.5 text-platform md:py-4">
        <div className="marquee-track">
          {renderHalf(false)}
          {renderHalf(true)}
        </div>
        <TickerPauseButton />
      </div>
    </div>
  );
}
