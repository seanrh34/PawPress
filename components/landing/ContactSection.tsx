import { FaGithub, FaLinkedin, FaEnvelope } from 'react-icons/fa';

const CHANNELS = [
  {
    href: 'mailto:34cats.dev@gmail.com',
    label: 'Email 34cats',
    icon: FaEnvelope,
  },
  {
    href: 'https://www.linkedin.com/in/sean-hardjanto-0b8874139/',
    label: '34cats on LinkedIn',
    icon: FaLinkedin,
  },
  {
    href: 'https://github.com/seanrh34',
    label: '34cats on GitHub',
    icon: FaGithub,
  },
] as const;

export default function ContactSection() {
  return (
    <section id="contact" className="bg-gray-50 py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 text-center sm:p-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Get in touch</h2>
          <p className="mt-3 text-gray-600">
            Questions about PawPress, this blog, or a collaboration? Reach out on any channel below.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            {CHANNELS.map((channel) => (
              <a
                key={channel.href}
                href={channel.href}
                target={channel.href.startsWith('mailto:') ? undefined : '_blank'}
                rel="noopener noreferrer"
                aria-label={channel.label}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:border-blue-200 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <channel.icon className="h-5 w-5" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
