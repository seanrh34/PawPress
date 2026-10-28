import Link from 'next/link';
import { FaGithub, FaLinkedin, FaEnvelope } from 'react-icons/fa';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* About Section */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">About 34cats</h3>
            <p className="text-sm">
              A modern blog sharing insights on technology, development, and design.
              Powered by PawPress CMS.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/#home" className="hover:text-white transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/#posts" className="hover:text-white transition-colors">
                  Posts
                </Link>
              </li>
              <li>
                <Link href="/category" className="hover:text-white transition-colors">
                  Categories
                </Link>
              </li>
              <li>
                <Link href="/#pawpress" className="hover:text-white transition-colors">
                  Build Your Own
                </Link>
              </li>
              <li>
                <Link href="/#cli" className="hover:text-white transition-colors">
                  CLI
                </Link>
              </li>
              <li>
                <Link href="/#contact" className="hover:text-white transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/admin" className="hover:text-white transition-colors">
                  Admin Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact/Social */}
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">Connect</h3>
            <p className="text-sm mb-4">
              Let&apos;s stay in touch! Reach out through any of these channels.
            </p>
            <div className="flex gap-4 text-2xl">
              <a
                href="mailto:hello@34cats.com"
                className="hover:text-blue-400 transition-colors"
                aria-label="Email"
              >
                <FaEnvelope aria-hidden="true" />
              </a>
              <a
                href="https://www.linkedin.com/in/sean-hardjanto-0b8874139/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-400 transition-colors"
                aria-label="LinkedIn"
              >
                <FaLinkedin aria-hidden="true" />
              </a>
              <a
                href="https://github.com/seanrh34"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-400 transition-colors"
                aria-label="GitHub"
              >
                <FaGithub aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-800 mt-8 pt-8 text-sm text-center">
          <p>&copy; {currentYear} 34cats. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
