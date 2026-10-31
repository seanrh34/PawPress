'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/admin/PageHeader';

export default function NewCategoryPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: generateSlug(name),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/category', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to create category');
        setIsSubmitting(false);
        return;
      }

      alert('Category created successfully!');
      router.push('/admin/category');
    } catch (err) {
      console.error('Error creating category:', err);
      setError('Failed to create category. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Content"
        title="New Category"
        description="Create a new category for organizing your posts"
      />

      {/* Form */}
      <div className="admin-card max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error Message */}
          {error && (
            <div className="admin-alert admin-alert-error">
              <p>{error}</p>
            </div>
          )}

          {/* Name Field */}
          <div>
            <label htmlFor="name" className="admin-label">
              Category Name *
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              className="admin-input"
              placeholder="e.g., Technology, Lifestyle, Travel"
            />
          </div>

          {/* Slug Field */}
          <div>
            <label htmlFor="slug" className="admin-label">
              Slug *
            </label>
            <input
              type="text"
              id="slug"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              required
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              className="admin-input font-mono"
              placeholder="e.g., technology, lifestyle, travel"
            />
            <p className="admin-hint">
              URL-friendly version. Auto-generated from name, but you can customize it.
            </p>
            <p className="admin-hint">
              Preview: <span className="font-mono text-signal">domain.com/category/{formData.slug || 'slug'}</span>
            </p>
          </div>

          {/* Description Field */}
          <div>
            <label htmlFor="description" className="admin-label">
              Description *
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={4}
              className="admin-textarea"
              placeholder="A brief description of this category. This will be displayed on the category page."
            />
            <p className="admin-hint">{formData.description.length} characters</p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 border-t border-rail pt-4">
            <button
              type="button"
              onClick={() => router.push('/admin/category')}
              className="admin-btn admin-btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="admin-btn admin-btn-primary"
            >
              {isSubmitting ? 'Creating...' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
