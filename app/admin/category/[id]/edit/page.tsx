'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Category } from '@/lib/types';
import PageHeader from '@/components/admin/PageHeader';

export default function EditCategoryPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategory();
  }, [id]);

  const fetchCategory = async () => {
    try {
      const response = await fetch(`/api/category/${id}`);
      if (!response.ok) throw new Error('Failed to fetch category');

      const category: Category = await response.json();
      setFormData({
        name: category.name,
        slug: category.slug,
        description: category.description,
      });
    } catch (err) {
      console.error('Error fetching category:', err);
      setError('Failed to load category');
    } finally {
      setIsLoading(false);
    }
  };

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
      const response = await fetch(`/api/category/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to update category');
        setIsSubmitting(false);
        return;
      }

      alert('Category updated successfully!');
      router.push('/admin/category');
    } catch (err) {
      console.error('Error updating category:', err);
      setError('Failed to update category. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-signal mx-auto mb-4"></div>
          <p className="text-copy-muted">Loading category...</p>
        </div>
      </div>
    );
  }

  if (error && !formData.name) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="text-cancelled mb-4">
            <svg
              className="w-12 h-12 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Error Loading Category</h2>
          <p className="text-copy-muted mb-4">{error}</p>
          <button
            type="button"
            onClick={() => router.push('/admin/category')}
            className="admin-btn admin-btn-primary"
          >
            Back to Categories
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Content"
        title="Edit Category"
        description="Update category information"
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
            <p className="admin-hint text-warning">
              Warning: changing the slug will break existing links to this category page
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
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
