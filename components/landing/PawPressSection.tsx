import { FiEdit3, FiFolder, FiClock, FiLock, FiUsers, FiTerminal, FiArrowRight } from 'react-icons/fi';
import { FaGithub } from 'react-icons/fa';

const FEATURES = [
  {
    icon: FiEdit3,
    title: 'Rich Lexical editor',
    description: 'A fast, modern editor with images and embeds built in.',
  },
  {
    icon: FiFolder,
    title: 'Categories & clean URLs',
    description: 'Organise posts by topic with readable, shareable links.',
  },
  {
    icon: FiClock,
    title: 'Scheduled publishing',
    description: 'Queue posts to go live at exactly the right moment.',
  },
  {
    icon: FiLock,
    title: 'Edit locks',
    description: 'Humans and agents never overwrite each other mid-edit.',
  },
  {
    icon: FiUsers,
    title: 'Role-based admin',
    description: 'Supabase Auth keeps author, admin, and reader roles separate.',
  },
  {
    icon: FiTerminal,
    title: 'Agent-ready CLI & API',
    description: 'Let coding agents pull, draft, and push posts from the terminal.',
  },
] as const;

export default function PawPressSection() {
  return (
    <section id="pawpress" className="bg-white py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Want a blog like this?</h2>
          <p className="mt-3 text-lg text-gray-600">
            This site runs on PawPress, an open-source CMS built with Next.js and Supabase — free to
            fork, customise, and deploy.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-gray-200 bg-gray-50/50 p-6"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <feature.icon className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">{feature.title}</h3>
              <p className="mt-1 text-sm text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-6 rounded-2xl border border-gray-200 bg-gray-50/50 p-6 sm:p-8">
          <p className="text-sm text-gray-600 max-w-md">
            100% open source under the{' '}
            <a
              href="https://github.com/seanrh34/PawPress/blob/master/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gray-900 underline underline-offset-2 hover:text-blue-700"
            >
              MIT license
            </a>
            . Fork it, customise it, make it yours.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <a
              href="https://github.com/seanrh34/PawPress"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
              <FaGithub aria-hidden="true" className="w-4 h-4" />
              View on GitHub
            </a>
            <a
              href="https://github.com/seanrh34/PawPress/blob/master/docs/cli.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Read the CLI docs
              <FiArrowRight aria-hidden="true" className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
