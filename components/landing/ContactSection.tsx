'use client';

import { useState } from 'react';

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
              We'd love to hear from you. Drop us a message and we'll get back to you as soon as possible.
            </p>
          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-6 text-center">
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
              <div className="text-3xl mb-2">📧</div>
              <h4 className="font-semibold text-gray-900 mb-1">Email</h4>
              <p className="text-sm text-gray-600">hello@34cats.com</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
              <div className="text-3xl mb-2">💼</div>
              <h4 className="font-semibold text-gray-900 mb-1">Work With Us</h4>
              <p className="text-sm text-gray-600">Explore collaboration</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
              <div className="text-3xl mb-2">🐙</div>
              <h4 className="font-semibold text-gray-900 mb-1">GitHub</h4>
              <p className="text-sm text-gray-600">Check out our projects</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
