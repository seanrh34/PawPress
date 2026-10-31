'use client';

import Link from 'next/link';
import { Post } from '@/lib/types';
import { postStatus } from '@/lib/cms/status';
import { useEffect, useState } from 'react';
import { FiFileText, FiPlus, FiSearch } from 'react-icons/fi';
import PageHeader from '@/components/admin/PageHeader';

type StatusFilter = 'all' | 'published' | 'scheduled' | 'draft';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'draft', label: 'Drafts' },
];

export default function AdminDashboard() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [locks, setLocks] = useState<Record<string, { kind: 'user' | 'agent'; label: string }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchLocks = async () => {
    try {
      const response = await fetch('/api/posts/locks');
      if (!response.ok) return;
      const data = await response.json();
      // Skipped entirely when the post_edit_locks migration isn't applied.
      if (data.locking === 'enabled') {
        setLocks(data.locks ?? {});
      }
    } catch (err) {
      console.error('Error fetching edit locks:', err);
    }
  };

  const fetchPosts = async () => {
    try {
      const response = await fetch('/api/posts');
      if (!response.ok) {
        throw new Error('Failed to fetch posts');
      }
      const data = await response.json();

      // Fetch categories for each post
      const postsWithCategories = await Promise.all(
        data.map(async (post: Post) => {
          if (post.category_id) {
            try {
              const categoryResponse = await fetch(`/api/category/${post.category_id}`);
              if (categoryResponse.ok) {
                const category = await categoryResponse.json();
                return { ...post, category };
              }
            } catch (err) {
              console.error('Error fetching category:', err);
            }
          }
          return post;
        })
      );

      setPosts(postsWithCategories);
      void fetchLocks();
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/posts/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete post');
      }

      // Remove post from local state
      setPosts(posts.filter(post => post.id !== id));
      alert('Post deleted successfully');
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post. Please try again.');
    }
  };

  const now = new Date();
  const publishedCount = posts.filter(p => postStatus(p.published_at, now) === 'published').length;
  const scheduledCount = posts.filter(p => postStatus(p.published_at, now) === 'scheduled').length;
  const draftCount = posts.filter(p => postStatus(p.published_at, now) === 'draft').length;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredPosts = posts.filter((post) => {
    const status = postStatus(post.published_at, now);
    if (statusFilter !== 'all' && status !== statusFilter) {
      return false;
    }
    if (
      normalizedQuery &&
      !post.title.toLowerCase().includes(normalizedQuery) &&
      !post.slug.toLowerCase().includes(normalizedQuery)
    ) {
      return false;
    }
    return true;
  });

  const counts: Record<StatusFilter, number> = {
    all: posts.length,
    published: publishedCount,
    scheduled: scheduledCount,
    draft: draftCount,
  };

  const stats: { label: string; value: number }[] = [
    { label: 'Total', value: posts.length },
    { label: 'Published', value: publishedCount },
    { label: 'Scheduled', value: scheduledCount },
    { label: 'Drafts', value: draftCount },
  ];

  const renderActions = (post: Post, status: string) => (
    <div className="flex flex-wrap items-center gap-1">
      {status === 'published' ? (
        <Link href={`/${post.slug}`} className="admin-btn admin-btn-ghost">
          View
        </Link>
      ) : (
        <span className="admin-btn admin-btn-ghost cursor-not-allowed opacity-50" aria-disabled="true">
          View
        </span>
      )}
      <Link href={`/admin/posts/${post.id}/edit`} className="admin-btn admin-btn-ghost">
        Edit
      </Link>
      <button
        type="button"
        onClick={() => handleDelete(post.id, post.title)}
        className="admin-btn admin-btn-ghost-danger"
      >
        Delete
      </button>
    </div>
  );

  const renderLockNote = (postId: string) => {
    const lock = locks[postId];
    if (!lock) return null;
    return (
      <div
        className={`mt-1 font-mono text-xs ${
          lock.kind === 'agent' ? 'admin-text-agent' : 'text-warning'
        }`}
      >
        {lock.kind === 'agent' ? `Agent editing: ${lock.label}` : `Being edited by ${lock.label}`}
      </div>
    );
  };

  const renderStatusCell = (post: Post) => {
    const status = postStatus(post.published_at, now);
    return (
      <>
        <span
          className={`status-badge ${
            status === 'published'
              ? 'status-badge-published'
              : status === 'scheduled'
                ? 'status-badge-scheduled'
                : 'status-badge-draft'
          }`}
        >
          {status === 'published' ? 'Published' : status === 'scheduled' ? 'Scheduled' : 'Draft'}
        </span>
        {status === 'scheduled' && post.published_at && (
          <div className="mt-1 text-xs text-warning">
            Goes live {new Date(post.published_at).toLocaleString()}
          </div>
        )}
      </>
    );
  };

  return (
    <div>
      <PageHeader
        eyebrow="Content"
        title="Dashboard"
        description="Manage your blog posts and content"
        actions={
          <Link href="/admin/posts/new" className="admin-btn admin-btn-primary">
            <FiPlus size={16} aria-hidden="true" />
            New post
          </Link>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="admin-card p-4 md:p-5">
            <p className="portal-heading text-3xl">{stat.value}</p>
            <p className="portal-label mt-2 text-copy-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Posts card */}
      <section className="admin-card">
        <div className="admin-card-header flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-lg font-semibold">All posts</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="admin-segment" role="group" aria-label="Filter posts by status">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={statusFilter === filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {filter.label} ({counts[filter.value]})
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <FiSearch
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-copy-muted"
              />
              <label htmlFor="post-search" className="sr-only">
                Search posts
              </label>
              <input
                id="post-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title or slug"
                className="admin-input pl-9"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-copy-muted">
            <p>Loading posts...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <FiFileText size={24} aria-hidden="true" className="text-copy-muted" />
            <p className="text-copy-muted">No posts yet. Create your first post to get started!</p>
            <Link href="/admin/posts/new" className="admin-btn admin-btn-primary">
              <FiPlus size={16} aria-hidden="true" />
              New post
            </Link>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <FiSearch size={24} aria-hidden="true" className="text-copy-muted" />
            <p className="text-copy-muted">No posts match the current filter and search.</p>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setQuery('');
              }}
              className="admin-btn admin-btn-ghost"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {/* Table, md and up */}
            <div className="hidden md:block">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Post</th>
                    <th scope="col">Category</th>
                    <th scope="col">Status</th>
                    <th scope="col">Date</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map((post) => {
                    const status = postStatus(post.published_at, now);
                    return (
                      <tr key={post.id}>
                        <td>
                          <div className="font-medium text-copy">{post.title}</div>
                          <div className="admin-mono-meta">/{post.slug}</div>
                          {renderLockNote(post.id)}
                        </td>
                        <td>
                          {post.category ? (
                            <span className="text-copy">{post.category.name}</span>
                          ) : (
                            <span className="text-copy-muted">No category</span>
                          )}
                        </td>
                        <td>{renderStatusCell(post)}</td>
                        <td className="admin-mono-meta whitespace-nowrap">
                          {new Date(post.published_at || post.created_at).toLocaleDateString()}
                        </td>
                        <td>{renderActions(post, status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Stacked cards, below md */}
            <div className="flex flex-col gap-4 md:hidden">
              {filteredPosts.map((post) => {
                const status = postStatus(post.published_at, now);
                return (
                  <div key={post.id} className="rounded-[var(--radius-panel)] border border-rail p-4">
                    <p className="font-medium text-copy">{post.title}</p>
                    <p className="admin-mono-meta mt-0.5">/{post.slug}</p>
                    {renderLockNote(post.id)}
                    <dl className="mt-3 space-y-2 text-sm">
                      <div>
                        <dt className="portal-label text-copy-muted">Category</dt>
                        <dd className="mt-0.5">
                          {post.category ? (
                            post.category.name
                          ) : (
                            <span className="text-copy-muted">No category</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="portal-label text-copy-muted">Status</dt>
                        <dd className="mt-1">{renderStatusCell(post)}</dd>
                      </div>
                      <div>
                        <dt className="portal-label text-copy-muted">Date</dt>
                        <dd className="admin-mono-meta mt-0.5">
                          {new Date(post.published_at || post.created_at).toLocaleDateString()}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-4 border-t border-rail pt-3">{renderActions(post, status)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
