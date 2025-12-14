'use client';

import Image from 'next/image';
import Link from 'next/link';

export default function HeroSection() {
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
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
  };

  return (
    <section className="bg-white py-20" id="home">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          {/* Logo Placeholder */}
          <div className="flex justify-center mb-8">
            <Image 
              src="/34cats_main_light.png" 
              alt="34cats Logo" 
              width={400} 
              height={400}
              className="rounded-2xl"
            />
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 mb-6">
            The 34cats Blog
          </h1>
          
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8 leading-relaxed">
            Insights, stories, and perspectives from the 34cats team. 
            We write about technology, development, design, and the lessons we learn building digital products.
          </p>

          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-10">
            Join us as we explore the intersection of code, creativity, and problem-solving. 
            From technical deep-dives to industry observations, we share what we discover along the way.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="#posts"
              onClick={(e) => handleLinkClick(e, '#posts')}
              className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-lg shadow-md hover:shadow-lg"
            >
              Read Our Posts
            </Link>
            <Link
              href="#contact"
              onClick={(e) => handleLinkClick(e, '#contact')}
              className="px-8 py-4 bg-white text-blue-600 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-semibold text-lg"
            >
              Get in Touch
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
