'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Category } from '@/lib/types';
import { FiFolder, FiPlus } from 'react-icons/fi';
import PageHeader from '@/components/admin/PageHeader';

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/category');
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      setCategories(data);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError('Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the category "${name}"? This will fail if any posts use this category.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/category/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to delete category');
        return;
      }

      alert('Category deleted successfully');
      fetchCategories();
    } catch (err) {
      console.error('Error deleting category:', err);
      alert('Failed to delete category');
    }
  };

  const renderActions = (category: Category) => (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => router.push(`/category/${category.slug}`)}
        className="admin-btn admin-btn-ghost"
      >
        View
      </button>
      <button
        type="button"
        onClick={() => router.push(`/admin/category/${category.id}/edit`)}
        className="admin-btn admin-btn-ghost"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => handleDelete(category.id, category.name)}
        className="admin-btn admin-btn-ghost-danger"
      >
        Delete
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-signal mx-auto mb-4"></div>
          <p className="text-copy-muted">Loading categories...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Content"
        title="Categories"
        description="Manage your blog categories"
        actions={
          <>
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="admin-btn admin-btn-ghost"
            >
              Back to Dashboard
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin/category/new')}
              className="admin-btn admin-btn-primary"
            >
              <FiPlus size={16} aria-hidden="true" />
              New Category
            </button>
          </>
        }
      />

      {/* Error State */}
      {error && (
        <div className="admin-alert admin-alert-error mb-6">
          <p>{error}</p>
        </div>
      )}

      {/* Categories List */}
      {categories.length === 0 ? (
        <div className="admin-card flex flex-col items-center gap-3 py-12 text-center">
          <FiFolder size={24} aria-hidden="true" className="text-copy-muted" />
          <p className="text-copy-muted">No categories yet</p>
          <button
            type="button"
            onClick={() => router.push('/admin/category/new')}
            className="admin-btn admin-btn-primary"
          >
            <FiPlus size={16} aria-hidden="true" />
            Create First Category
          </button>
        </div>
      ) : (
        <section className="admin-card">
          {/* Table, md and up */}
          <div className="hidden md:block">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Slug</th>
                  <th scope="col">Description</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td className="font-medium text-copy">{category.name}</td>
                    <td className="admin-mono-meta whitespace-nowrap">{category.slug}</td>
                    <td className="max-w-md text-copy-muted line-clamp-2">
                      {category.description}
                    </td>
                    <td>{renderActions(category)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stacked cards, below md */}
          <div className="flex flex-col gap-4 md:hidden">
            {categories.map((category) => (
              <div key={category.id} className="rounded-[var(--radius-panel)] border border-rail p-4">
                <p className="font-medium text-copy">{category.name}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="portal-label text-copy-muted">Slug</dt>
                    <dd className="admin-mono-meta mt-0.5">{category.slug}</dd>
                  </div>
                  <div>
                    <dt className="portal-label text-copy-muted">Description</dt>
                    <dd className="mt-0.5 text-copy-muted">{category.description}</dd>
                  </div>
                </dl>
                <div className="mt-4 border-t border-rail pt-3">{renderActions(category)}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
