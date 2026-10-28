import type { CSSProperties } from 'react';
import { BrowserFrame } from '@/components/shared/browser-frame';

const FEATURES = [
  {
    title: 'Rich Lexical editor',
    description: 'A fast, modern editor with images and embeds built in.',
  },
  {
    title: 'Categories and clean URLs',
    description: 'Organise posts by topic with readable, shareable links.',
  },
  {
    title: 'Scheduled publishing',
    description: 'Queue posts to go live at exactly the right moment.',
  },
  {
    title: 'Edit locks',
    description: 'See who else is editing a post before you save over their work.',
  },
  {
    title: 'Roles: master and admin',
    description: 'Only admins can publish.',
  },
  {
    title: 'Agent-ready CLI and API',
    description: 'Let coding agents pull, draft, and push posts from the terminal.',
  },
] as const;

const ROW_TINTS = ['var(--butter)', 'var(--lilac)', 'var(--sage)', 'var(--sky)'];

export default function PawPressSection() {
  return (
    <section id="pawpress" className="px-5 py-16 md:px-8 md:py-24">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="portal-label text-signal">[02] Build your own</p>
          <h2 className="portal-heading mt-3 text-4xl md:text-5xl">Want a blog like this one? Fork it.</h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-copy-muted">
            PawPress is the CMS behind this site: Next.js, Supabase and a Lexical editor. It is MIT licensed, so take
            it and make it yours.
          </p>

          <ul className="mt-8">
            {FEATURES.map((feature, i) => (
              <li
                key={feature.title}
                className="link-row flex gap-4 border-b border-rail py-4 first:pt-0 last:border-b-0"
                style={{ '--row-tint': ROW_TINTS[i % ROW_TINTS.length] } as CSSProperties}
              >
                <span className="portal-label pt-1.5 text-copy-muted">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <h3 className="portal-heading text-xl text-copy">{feature.title}</h3>
                  <p className="mt-1 text-sm text-copy-muted">{feature.description}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3.5 sm:flex-row">
            <a
              href="https://github.com/seanrh34/PawPress"
              target="_blank"
              rel="noopener noreferrer"
              className="portal-button portal-button-primary"
            >
              View on GitHub <span className="btn-arrow-up" aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a
              href="https://github.com/seanrh34/PawPress/blob/master/docs/cli.md"
              target="_blank"
              rel="noopener noreferrer"
              className="portal-button portal-button-secondary"
            >
              Read the CLI guide <span className="btn-arrow-up" aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>

        <div className="lg:pt-12">
          <div className="rounded-panel bg-butter p-5 sm:p-8">
            <div className="frame-hover">
              <BrowserFrame
                src="/images/pawpress-screenshot.png"
                alt="The PawPress post editor with a draft open"
                host="blog.34cats.com/admin"
                rotate={-2}
              />
            </div>
            <p className="mt-5 text-sm text-copy/80">The PawPress editor I use to publish this blog.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
