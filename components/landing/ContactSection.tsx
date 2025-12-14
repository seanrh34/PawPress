'use client';

import { useState } from 'react';
import { FaGithub, FaLinkedin, FaEnvelope } from 'react-icons/fa';

export default function ContactSection() {
  return (
    <section id="contact" className="bg-gray-50 py-20 text-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Get in Touch
            </h2>
            <p className="text-xl text-gray-600">
              Have a project in mind? Want to discuss a collaboration or just say hello? 
              I'd love to hear from you. Drop me a message and I'll get back to you as soon as possible.
            </p>
          </div>

          <div className="mt-12 flex justify-center gap-8 text-4xl text-gray-700">
            <a
              href="mailto:34cats.dev@gmail.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 transition-colors"
            >
              <FaEnvelope />
            </a>
            <a
              href="https://www.linkedin.com/in/sean-hardjanto-0b8874139/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 transition-colors"
            >
              <FaLinkedin />
            </a>
            <a
              href="https://github.com/seanrh34"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 transition-colors"
            >
              <FaGithub />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
