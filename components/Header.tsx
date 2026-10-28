'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const NAV_LINKS = [
  { href: '/#posts', label: 'Posts' },
  { href: '/category', label: 'Categories' },
  { href: '/#pawpress', label: 'PawPress' },
  { href: '/#cli', label: 'CLI' },
] as const;

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <header className="sticky top-0 z-50 px-3 pt-3">
      <nav
        aria-label="Main"
        className={`mx-auto flex max-w-6xl items-center gap-4 rounded-full border border-rail bg-platform/80 py-1.5 pl-5 pr-2 backdrop-blur-md transition-shadow duration-300 ${
          scrolled ? 'shadow-[0_10px_30px_-10px_rgba(28,25,21,0.35)]' : 'shadow-[0_2px_8px_-4px_rgba(28,25,21,0.2)]'
        }`}
      >
        <Link href="/" className="-my-3 flex shrink-0 items-center" aria-label="34cats home">
          <Image src="/34cats_main_light.png" alt="" width={240} height={120} className="h-16 w-auto" priority />
        </Link>

        <div className="hidden items-center gap-5 md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="nav-link text-sm font-medium text-copy">
              {link.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <a
            href="https://34cats.com"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-link text-sm font-medium text-copy"
          >
            Portfolio <span aria-hidden="true" className="ml-1">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <Link href="/#contact" className="portal-button portal-button-primary rounded-full">
            Say hello
          </Link>
        </div>

        <div className="ml-auto flex items-center md:hidden">
          <button
            ref={menuButtonRef}
            type="button"
            className="portal-button portal-button-secondary rounded-full"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-controls={isOpen ? 'mobile-navigation' : undefined}
          >
            {isOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </nav>

      {isOpen && (
        <div
          id="mobile-navigation"
          className="absolute inset-x-3 top-full mt-2 overflow-hidden rounded-[1.75rem] border border-rail bg-platform-raised p-3 shadow-[0_18px_40px_-14px_rgba(28,25,21,0.45)] md:hidden"
        >
          <nav aria-label="Mobile" className="space-y-1">
            {NAV_LINKS.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                className="nav-menu-item portal-heading block rounded-control px-4 py-3 text-2xl hover:bg-surface-subtle"
                style={{ '--i': i } as CSSProperties}
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="nav-menu-item grid gap-2 pt-2 sm:grid-cols-2" style={{ '--i': NAV_LINKS.length } as CSSProperties}>
              <a href="https://34cats.com" target="_blank" rel="noopener noreferrer" className="portal-button portal-button-secondary">
                Portfolio <span aria-hidden="true">↗</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <Link href="/#contact" onClick={() => setIsOpen(false)} className="portal-button portal-button-primary">
                Say hello
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
