import Link from 'next/link';
import type { CSSProperties } from 'react';
import { BrowserFrame } from '@/components/shared/browser-frame';
import { Bracket } from '@/components/brand/bracket';
import { Post } from '@/lib/types';

interface PostCardProps {
  post: Post;
  featured?: boolean;
  /** Alternates the tinted image panel and frame tilt between cards. */
  index?: number;
}

const TINT_CYCLE = ['bg-butter', 'bg-lilac', 'bg-sage', 'bg-sky'] as const;

// Fixed locale + timeZone so server and client render the same string (no hydration mismatch).
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export default function PostCard({ post, featured = false, index }: PostCardProps) {
  const published = post.published_at ? new Date(post.published_at) : null;
  const publishedLabel =
    published && !Number.isNaN(published.getTime()) ? dateFormatter.format(published) : null;
  const tint = index === undefined ? 'bg-sky' : TINT_CYCLE[index % TINT_CYCLE.length];
  const rotate = index === undefined ? -1.5 : index % 2 ? 1.5 : -1.5;

  return (
    <Link
      href={`/${post.slug}`}
      className={`app-card group relative block h-full min-w-0 ${featured ? 'md:col-span-2 lg:col-span-3' : ''}`}
    >
      <div className={`relative flex h-full min-w-0 flex-col overflow-hidden rounded-panel border border-rail bg-platform-raised ${featured ? 'lg:flex-row' : ''}`}>
        {/* Tinted image panel with the featured image in browser chrome */}
        <div className={`relative min-w-0 ${tint} px-6 pb-9 pt-10 md:px-9 ${featured ? 'lg:w-[55%]' : ''}`}>
          {featured && (
            <Bracket shape="corner" className="card-corner absolute left-4 top-4 size-8" stroke="var(--text)" strokeWidth={3.5} />
          )}
          {post.featured_image_url ? (
            <BrowserFrame
              src={post.featured_image_url}
              alt=""
              host={`blog.34cats.com/${post.slug}`}
              rotate={rotate}
              sizes={featured ? '(max-width: 1024px) 100vw, 700px' : '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw'}
            />
          ) : (
            <div
              className="card-frame overflow-hidden rounded-xl border-2 border-copy"
              style={{ '--frame-rot': `${rotate}deg` } as CSSProperties}
            >
              <div className="flex items-center gap-3 border-b-2 border-copy bg-surface-subtle px-3 py-2" aria-hidden="true">
                <span className="flex shrink-0 gap-1.5">
                  <span className="size-2.5 rounded-full bg-tomato" />
                  <span className="size-2.5 rounded-full bg-butter" />
                  <span className="size-2.5 rounded-full bg-sage" />
                </span>
                <span className="min-w-0 flex-1 truncate rounded-full bg-platform-raised px-3 py-1 font-mono text-[0.6875rem] text-copy-muted">
                  {`blog.34cats.com/${post.slug}`}
                </span>
              </div>
              <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2">
                <Bracket shape="open" className="w-16" stroke="var(--text)" strokeWidth={5} />
                <span className="portal-label text-copy-muted">no cover image</span>
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex min-w-0 flex-1 flex-col p-6 md:p-8">
          {post.category && (
            <span className="portal-label w-fit rounded-full border border-copy px-2.5 py-1 text-copy">
              {post.category.name}
            </span>
          )}

          <h3
            className={`portal-heading mt-4 line-clamp-2 break-words text-copy ${
              featured ? 'text-3xl md:text-4xl' : 'text-2xl'
            }`}
          >
            {post.title}
          </h3>

          <p className="mt-2 line-clamp-3 flex-1 text-copy-muted">{post.excerpt}</p>

          <div className="mt-auto flex items-center justify-between gap-3 pt-5">
            {publishedLabel ? (
              <time dateTime={post.published_at ?? undefined} className="font-mono text-xs text-copy-muted">
                {publishedLabel}
              </time>
            ) : (
              <span />
            )}
            <span className="inline-flex items-center gap-1 text-sm font-medium text-signal">
              Read <span aria-hidden="true" className="transition-transform motion-safe:group-hover:translate-x-0.5">→</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
