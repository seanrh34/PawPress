import { FiFileText, FiKey, FiLock, FiClock, FiCode, FiEye, FiArrowRight } from 'react-icons/fi';
import CliTerminal from './CliTerminal';
import CopyButton from './CopyButton';

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[0.875em] text-slate-200">
      {children}
    </code>
  );
}

const HIGHLIGHTS = [
  {
    icon: FiFileText,
    label: (
      <>Pull → edit → push Markdown</>
    ),
  },
  {
    icon: FiKey,
    label: (
      <>Scoped, expiring tokens — least privilege; agents write drafts, humans publish</>
    ),
  },
  {
    icon: FiLock,
    label: <>Edit locks + conflict detection</>,
  },
  {
    icon: FiClock,
    label: (
      <>
        Schedule posts with <InlineCode>--at</InlineCode>
      </>
    ),
  },
  {
    icon: FiCode,
    label: (
      <>
        <InlineCode>--json</InlineCode> output and stable exit codes 0–7
      </>
    ),
  },
  {
    icon: FiEye,
    label: (
      <>
        <InlineCode>--dry-run</InlineCode> to preview creates, pushes, updates and deletes
      </>
    ),
  },
] as const;

const QUICK_START: {
  title: string;
  body: React.ReactNode;
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
        In your site&apos;s admin under API Tokens (<InlineCode>/admin/tokens</InlineCode>), pick
        scopes and an expiry — the token is shown once. For agents, grant least privilege:
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
    <section id="cli" className="bg-slate-950 py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Copy */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
              pawpress CLI
            </p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white">
              Write from your terminal. Or let your agent do it.
            </h2>
            <p className="mt-4 max-w-xl text-slate-300">
              Posts are Markdown + YAML front matter. A scoped API token, JSON output, and stable
              exit codes make the CLI safe to hand to AI coding agents.
            </p>

            <ul className="mt-8 space-y-4">
              {HIGHLIGHTS.map((highlight, index) => (
                <li key={index} className="flex items-start gap-3">
                  <highlight.icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" aria-hidden="true" />
                  <span className="text-slate-300">{highlight.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Terminal mockup */}
          <CliTerminal />
        </div>

        {/* Get started */}
        <div className="mt-16 sm:mt-20">
          <h3 className="text-2xl font-bold text-white">Get started in 3 steps</h3>
          <div className="mt-6 grid gap-4 sm:gap-6 lg:grid-cols-3">
            {QUICK_START.map((step, index) => (
              <div
                key={step.title}
                className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-sm font-semibold text-blue-400">
                      {index + 1}
                    </span>
                    <h4 className="font-semibold text-white">{step.title}</h4>
                  </div>
                  {step.code && <CopyButton text={step.code} />}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">{step.body}</p>
                {step.chips && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {step.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-200"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
                {step.code && (
                  <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200">
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
            className="inline-flex items-center gap-1.5 font-medium text-blue-400 transition-colors hover:text-blue-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
          >
            Read the full CLI guide
            <FiArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
