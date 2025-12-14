'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    // Extract the hash from the href (e.g., "/#apps" -> "apps")
    const hash = href.includes('#') ? href.split('#')[1] : '';
    if (hash) {
      const element = document.getElementById(hash);
      if (element) {
        const navbarHeight = 64; // h-16 = 64px
        const elementPosition = element.getBoundingClientRect().top + window.scrollY;
        const offsetPosition = elementPosition - navbarHeight;
        
        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth"
        });
      }
    }
    setIsOpen(false);
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <Image 
              src="/34cats_main_light.png" 
              alt="34cats Logo" 
              width={150} 
              height={40}
              className="h-10 w-auto"
            />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8">
            <Link 
              href="/#home"
              onClick={(e) => handleLinkClick(e, '/#home')}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Home
            </Link>
            <Link 
              href="/#posts"
              onClick={(e) => handleLinkClick(e, '/#posts')}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Posts
            </Link>
            <Link 
              href="/#pawpress"
              onClick={(e) => handleLinkClick(e, '/#pawpress')}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Build Your Own
            </Link>
            <Link 
              href="/#contact"
              onClick={(e) => handleLinkClick(e, '/#contact')}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Contact
            </Link>
          </nav>

          {/* Mobile Menu Button */}
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-gray-600 hover:text-gray-900"
            aria-label="Toggle menu"
          >
            {isOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Navigation Menu */}
        {isOpen && (
          <nav className="md:hidden py-4 border-t border-gray-200">
            <div className="flex flex-col space-y-4">
              <Link 
                href="/#home"
                onClick={(e) => handleLinkClick(e, '/#home')}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Home
              </Link>
              <Link 
                href="/#posts"
                onClick={(e) => handleLinkClick(e, '/#posts')}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Posts
              </Link>
              <Link 
                href="/#pawpress"
                onClick={(e) => handleLinkClick(e, '/#pawpress')}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Build Your Own
              </Link>
              <Link 
                href="/#contact"
                onClick={(e) => handleLinkClick(e, '/#contact')}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Contact
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
