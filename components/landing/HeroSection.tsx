import Image from 'next/image';
import Link from 'next/link';

export default function HeroSection() {
  return (
    <section
      id="home"
      className="relative overflow-hidden bg-white"
      style={{
        backgroundImage:
          'radial-gradient(circle at 15% 20%, rgba(219, 234, 254, 0.55) 0%, rgba(255, 255, 255, 0) 45%), radial-gradient(circle at 85% 10%, rgba(224, 231, 255, 0.5) 0%, rgba(255, 255, 255, 0) 40%), radial-gradient(rgba(100, 116, 139, 0.14) 1px, transparent 1px)',
        backgroundSize: 'auto, auto, 24px 24px',
      }}
    >
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Text column */}
          <div>
            <Link
              href="/#cli"
              className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs sm:text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Powered by PawPress
              <span className="text-blue-300" aria-hidden="true">·</span>
              now with a CLI
              <span aria-hidden="true">→</span>
            </Link>

            <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900">
              The 34cats Blog
            </h1>

            <p className="mt-5 max-w-xl text-lg text-gray-600 leading-relaxed">
              Insights on technology, development, and design from the{' '}
              <a
                href="https://seanhardjanto.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline underline-offset-2 transition-colors"
              >
                developer
              </a>{' '}
              behind 34cats — and the open-source CMS that powers it.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Link
                href="/#posts"
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Read the posts
              </Link>
              <Link
                href="/#cli"
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Explore the CLI
              </Link>
            </div>
          </div>

          {/* Logo card */}
          <div className="flex justify-center lg:justify-end">
            <div className="rounded-2xl border border-gray-200 bg-white/70 p-6 sm:p-10 backdrop-blur-sm">
              <Image
                src="/34cats_main_light.png"
                alt="34cats logo"
                width={320}
                height={320}
                sizes="(max-width: 1024px) 160px, 320px"
                className="h-40 w-40 lg:h-80 lg:w-80 rounded-2xl"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
