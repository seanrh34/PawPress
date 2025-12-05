'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Editor from '@/components/Editor';

export default function NewPost() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [content, setContent] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Auto-generate slug from title
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    
    // Auto-generate slug if it hasn't been manually edited
    const autoSlug = newTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setSlug(autoSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          slug,
          excerpt,
          content_html: content,
          published_at: isPublished ? new Date().toISOString() : null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create post');
      }

      const data = await response.json();
      router.push('/admin');
      router.refresh();
    } catch (error) {
      console.error('Error creating post:', error);
      alert('Failed to create post. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/admin" className="text-gray-600 hover:text-gray-900">
                ← Back to Dashboard
              </Link>
            </div>
            <Link href="/" className="text-gray-600 hover:text-gray-900">
              View Site
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Create New Post</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Title *
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={handleTitleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter post title"
            />
          </div>

          {/* Slug */}
          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-2">
              Slug *
            </label>
            <input
              type="text"
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="post-url-slug"
            />
            <p className="mt-1 text-sm text-gray-500">
              URL: /posts/{slug || 'your-post-slug'}
            </p>
          </div>

          {/* Excerpt */}
          <div>
            <label htmlFor="excerpt" className="block text-sm font-medium text-gray-700 mb-2">
              Excerpt
            </label>
            <textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Brief description of your post"
            />
          </div>

          {/* Content - Placeholder for QuillJS */}
          <div className='text-black'>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
              Content
            </label>
            <Editor/>
            <p className="mt-1 text-sm text-gray-500">
              Note: Rich text editor will be added in the next step
            </p>
          </div>

          {/* Publish Toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isPublished"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isPublished" className="text-sm font-medium text-gray-700">
              Publish immediately
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : isPublished ? 'Publish Post' : 'Save as Draft'}
            </button>
            <Link
              href="/admin"
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
