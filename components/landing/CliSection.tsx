import type { ReactNode } from 'react';
import CliTerminal from './CliTerminal';
import CopyButton from './CopyButton';

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-[#221e17] px-1.5 py-0.5 font-mono text-[0.875em] text-[#f3ecdf]">
      {children}
    </code>
  );
}

const HIGHLIGHTS = [
  <>Pull → edit → push Markdown</>,
  <>Scoped, expiring tokens: agents write drafts, humans publish</>,
  <>Edit locks + conflict detection</>,
  <>
    Schedule posts with <InlineCode>--at</InlineCode>
  </>,
  <>
    <InlineCode>--json</InlineCode> output and stable exit codes 0-7
  </>,
  <>
    <InlineCode>--dry-run</InlineCode> to preview creates, pushes, updates and deletes
  </>,
] as const;

const QUICK_START: {
  title: string;
  body: ReactNode;
  code?: string;
  chips?: string[];
}[] = [
  {
    title: 'Install the CLI',
    body: 'Requires Node.js 20+.',
    code: 'git clone https://github.com/seanrh34/PawPress && cd PawPress/cli && npm install && npm run build && npm link',
  },
  {
    title: 'Create an API token',
    body: (
      <>
        In your site&apos;s admin under API Tokens (<InlineCode>/admin/tokens</InlineCode>), pick scopes and an
        expiry; the token is shown once. For agents, grant least privilege:
      </>
    ),
    chips: ['posts:read', 'posts:write', 'media:upload'],
  },
  {
    title: 'Log in',
    body: 'Run this, paste your token when it waits (nothing is shown), then press Enter. The token never lands in your shell history.',
    code: 'read -rs PAWPRESS_TOKEN && printf \'%s\' "$PAWPRESS_TOKEN" | pawpress auth login --url https://your-site.example',
  },
];

export default function CliSection() {
  return (
    <section id="cli" className="relative overflow-hidden bg-[#17140f] py-16 text-[#f3ecdf] sm:py-24">
      {/* Faint dot grid */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(243, 236, 223, 0.09) 1.2px, transparent 1.6px)',
          backgroundSize: '26px 26px',
        }}
      />
      <div className="relative mx-auto max-w-6xl px-5 md:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Copy */}
          <div>
            <p className="portal-label text-[#ff6a4a]">[03] pawpress CLI</p>
            <h2 className="portal-heading mt-3 text-4xl md:text-5xl">
              Write from your terminal. Or let your agent do it.
            </h2>
            <p className="mt-4 max-w-xl text-[#f3ecdf]/80">
              Posts are Markdown + YAML front matter. A scoped API token, JSON output, and stable exit codes make the
              CLI safe to hand to AI coding agents.
            </p>

            <ul className="mt-8 space-y-3.5">
              {HIGHLIGHTS.map((highlight, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="text-[#ff6a4a]" aria-hidden="true">✦</span>
                  <span className="text-[#f3ecdf]/80">{highlight}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Terminal mockup */}
          <CliTerminal />
        </div>

        {/* Get started */}
        <div className="mt-16 sm:mt-20">
          <h3 className="portal-heading text-2xl">Get started in 3 steps</h3>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
            {QUICK_START.map((step, index) => (
              <div
                key={step.title}
                className="flex min-w-0 flex-col rounded-panel border border-[#3b3429] bg-[#221e17] p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="portal-label text-[#ff6a4a]">{String(index + 1).padStart(2, '0')}</span>
                  {step.code && <CopyButton text={step.code} />}
                </div>
                <h4 className="portal-heading mt-2 text-lg">{step.title}</h4>
                <p className="mt-2 text-sm leading-relaxed text-[#b5aa97]">{step.body}</p>
                {step.chips && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {step.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-md border border-[#3b3429] bg-[#17140f] px-2 py-1 font-mono text-xs text-[#f3ecdf]/80"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
                {step.code && (
                  <pre className="mt-4 whitespace-pre-wrap break-all rounded-control border border-[#3b3429] bg-[#17140f] p-3 font-mono text-xs leading-relaxed text-[#f3ecdf]/80">
                    <code>{step.code}</code>
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 text-center">
          <a
            href="https://github.com/seanrh34/PawPress/blob/master/docs/cli.md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-[#ff6a4a] transition-colors hover:text-[#ff8a70]"
          >
            Read the full CLI guide <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </section>
  );
}
