import { Post } from '@/lib/types';
import { WritingDesk, type DeskTile } from './WritingDesk';

const DESK_TINTS: DeskTile['tint'][] = ['butter', 'lilac', 'sage'];

// Fixed locale + timeZone so server and client render the same string.
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const WORDS = ['Notes', 'from', 'the'];

export default function HeroSection({ posts, categoryCount }: { posts: Post[]; categoryCount: number }) {
  const deskTiles: DeskTile[] =
    posts.length > 0
      ? posts.slice(0, 3).map((post, i) => {
          const published = post.published_at ? new Date(post.published_at) : null;
          return {
            label: post.category?.name ?? 'Post',
            title: post.title,
            date: published && !Number.isNaN(published.getTime()) ? dateFormatter.format(published) : 'Draft',
            tint: DESK_TINTS[i % DESK_TINTS.length],
          };
        })
      : [
          { label: 'Post', title: 'PawPress', date: 'Open-source CMS', tint: 'butter' },
          { label: 'Post', title: 'Lexical', date: 'Rich text editor', tint: 'lilac' },
          { label: 'Post', title: 'pawpress CLI', date: 'Write from a terminal', tint: 'sage' },
        ];

  const metaChunks: string[] = [];
  if (posts.length > 0) {
    metaChunks.push(`${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`);
  }
  if (categoryCount > 0) {
    metaChunks.push(`${categoryCount} ${categoryCount === 1 ? 'category' : 'categories'}`);
  }
  metaChunks.push('built on PawPress');

  return (
    <section id="home" className="relative px-5 pb-4 pt-10 md:px-8 md:pb-20 md:pt-16">
      <div className="hero-dots pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6">
        <div>
          <p className="hero-fade portal-label flex items-center gap-2.5 text-copy" style={{ '--d': '0ms' } as React.CSSProperties}>
            <span className="pulse-dot size-2.5 rounded-full bg-tomato" aria-hidden="true" />
            Writing by Sean · 34cats
          </p>
          <h1 className="portal-heading mt-5 text-[clamp(2.75rem,7.5vw,6rem)] leading-[0.95] tracking-[-0.04em] text-copy">
            {WORDS.map((word, i) => (
              <span key={word}>
                <span className="word-mask">
                  <span className="word" style={{ '--i': i } as React.CSSProperties}>{word}</span>
                </span>{' '}
              </span>
            ))}
            <span className="inline-block whitespace-nowrap">
              <span className="relative inline-block">
                <span className="word-mask">
                  <span className="word text-tomato" style={{ '--i': WORDS.length } as React.CSSProperties}>workbench</span>
                </span>
                <svg className="squiggle pointer-events-none absolute -bottom-[0.1em] left-0 h-[0.2em] w-full" viewBox="0 0 300 14" preserveAspectRatio="none" fill="none" aria-hidden="true">
                  <path d="M3 8 C22 1 36 14 56 7 S92 2 112 9 S152 14 172 6 S216 2 236 9 S276 13 297 5" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" pathLength={1} />
                </svg>
              </span>
              <span className="word-mask">
                <span className="word" style={{ '--i': WORDS.length + 1 } as React.CSSProperties}>.</span>
              </span>
            </span>
          </h1>
          <p className="hero-fade mt-7 max-w-xl text-lg leading-relaxed text-copy-muted md:text-xl" style={{ '--d': '800ms' } as React.CSSProperties}>
            I write about the apps I build, what broke along the way, and what I learned fixing it. This blog runs on
            PawPress, my open-source CMS, and you can drive it from a terminal.
          </p>
          <div className="hero-fade mt-8 flex flex-col gap-3.5 sm:flex-row" style={{ '--d': '950ms' } as React.CSSProperties}>
            <a href="#posts" className="portal-button portal-button-primary">
              Read the posts <span className="btn-arrow-down" aria-hidden="true">↓</span>
            </a>
            <a href="#cli" className="portal-button portal-button-secondary">
              Meet the CLI <span className="btn-arrow" aria-hidden="true">→</span>
            </a>
          </div>
          <p className="hero-fade portal-label mt-7 flex flex-wrap gap-x-2 gap-y-1 text-copy-muted" style={{ '--d': '1100ms' } as React.CSSProperties}>
            {metaChunks.map((chunk, i) => (
              <span key={chunk} className="whitespace-nowrap">
                {chunk}
                {i < metaChunks.length - 1 ? ' ·' : ''}
              </span>
            ))}
          </p>
        </div>

        <div className="mt-2 lg:mt-0">
          <WritingDesk tiles={deskTiles} />
        </div>
      </div>
    </section>
  );
}
