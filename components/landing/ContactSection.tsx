'use client';

import { useState } from 'react';

export default function ContactSection() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simulate form submission - replace with actual API call
    setStatus('success');
    setTimeout(() => {
      setFormData({ name: '', email: '', subject: '', message: '' });
      setStatus('idle');
    }, 3000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

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

          <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 border border-gray-100">
            {status === 'success' ? (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">✅</div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-2">Message Sent!</h3>
                <p className="text-gray-600">
                  Thank you for reaching out. We'll respond to your inquiry shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                      Your Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                    Subject *
                  </label>
                  <input
                    type="text"
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="What's this about?"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                    Your Message *
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows={6}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                    placeholder="Tell us more about your inquiry..."
                  />
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    className="w-full px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-lg shadow-md hover:shadow-lg"
                  >
                    Send Message
                  </button>
                </div>

                <p className="text-sm text-gray-500 text-center">
                  Your privacy matters. We'll never share your information with third parties.
                </p>
              </form>
            )}
          </div>

          {/* Additional Contact Info */}
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
