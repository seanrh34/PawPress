import Link from 'next/link';
import { Reveal } from '@/components/motion/reveal';

const groups = [
  {
    heading: 'Blog',
    links: [
      { label: 'Posts', href: '/#posts' },
      { label: 'Categories', href: '/category' },
      { label: 'CLI', href: '/#cli' },
      { label: 'Admin', href: '/admin' },
    ],
  },
  {
    heading: '34cats',
    links: [
      { label: 'Portfolio', href: 'https://34cats.com' },
      { label: 'Apps', href: 'https://apps.34cats.com' },
      { label: 'GitHub', href: 'https://github.com/seanrh34' },
    ],
  },
  {
    heading: 'Contact',
    links: [
      { label: 'Email', href: 'mailto:34cats.dev@gmail.com' },
      { label: 'LinkedIn', href: 'https://www.linkedin.com/in/sean-hardjanto-0b8874139/' },
    ],
  },
] as const;

const linkClass = 'inline-flex min-h-11 items-center text-sm text-copy-muted transition-colors hover:text-signal';

export default function Footer() {
  return (
    <footer className="overflow-hidden border-t border-rail bg-platform-raised px-5 pt-12 md:px-8 md:pt-16">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.5fr_3fr]">
        <div>
          <p className="portal-heading text-2xl">34cats</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-copy-muted">
            Writing by Sean, published with PawPress.
          </p>
          <a
            href="mailto:34cats.dev@gmail.com"
            className="mt-5 inline-flex min-h-11 items-center text-sm text-signal underline underline-offset-4"
          >
            34cats.dev@gmail.com
          </a>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 min-[360px]:grid-cols-3">
          {groups.map((group) => (
            <div key={group.heading}>
              <p className="portal-label text-copy">{group.heading}</p>
              <ul className="mt-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('http') ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                        {link.label}&nbsp;<span aria-hidden="true">↗</span>
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : (
                      <Link href={link.href} className={linkClass}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-2 border-t border-rail pt-6 text-xs text-copy-muted sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} 34cats</p>
        <p>Built with PawPress.</p>
      </div>
      <Reveal variant="fade" className="wordmark-wrap relative mx-auto mt-8 max-w-6xl select-none">
        <Wordmark color="var(--border)" />
        <Wordmark color="var(--accent)" className="wordmark-fill" />
      </Reveal>
    </footer>
  );
}

/** Edge-to-edge "34cats": textLength pins the width, the viewBox crops the bottom. */
function Wordmark({ color, className }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 30 1000 240" className={`block w-full ${className ?? ''}`} aria-hidden="true" focusable="false">
      <text x="0" y="270" textLength="1000" lengthAdjust="spacingAndGlyphs" fill={color} fontSize="330" className="wordmark-text">
        34cats
      </text>
    </svg>
  );
}
