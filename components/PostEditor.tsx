'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Editor from '@/components/Editor';
import FeaturedImageUpload from '@/components/FeaturedImageUpload';
import { useEditLock, lockAllowsSave } from '@/components/editLock';
import { SerializedEditorState } from 'lexical';
import { Post, Category } from '@/lib/types';
import { postStatus } from '@/lib/cms/status';
import { uploadImageViaServer } from '@/lib/clientUploads';
import { FiArrowLeft } from 'react-icons/fi';
import PageHeader from '@/components/admin/PageHeader';

interface PostEditorProps {
  post?: Post;
  mode: 'create' | 'edit';
}

type PublishMode = 'draft' | 'now' | 'schedule';

// A datetime-local value (`YYYY-MM-DDTHH:mm`) in the browser's time zone.
function toLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isFutureIso(iso: string | null | undefined): boolean {
  return !!iso && new Date(iso).getTime() > Date.now();
}

function initialPublishMode(post?: Post): PublishMode {
  if (!post?.published_at) return 'draft';
  return isFutureIso(post.published_at) ? 'schedule' : 'now';
}

export default function PostEditor({ post, mode }: PostEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title || '');
  const [slug, setSlug] = useState(post?.slug || '');
  const [excerpt, setExcerpt] = useState(post?.excerpt || '');
  const [content, setContent] = useState<SerializedEditorState | null>(post?.content_lexical || null);
  const [publishMode, setPublishMode] = useState<PublishMode>(() => initialPublishMode(post));
  const [scheduleAt, setScheduleAt] = useState(() => (isFutureIso(post?.published_at) ? toLocalDateTimeInput(post!.published_at!) : ''));
  // The schedule the post was loaded with. If the field still matches it, we
  // send the original published_at untouched (no lost seconds) even when other
  // fields change — and we don't re-validate a time that is now in the past.
  const [initialScheduleAt] = useState(() => (isFutureIso(post?.published_at) ? toLocalDateTimeInput(post!.published_at!) : ''));
  const [timeZone, setTimeZone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(post?.featured_image_url || null);
  const [featuredImageFile, setFeaturedImageFile] = useState<File>();
  const [isExternalUrl, setIsExternalUrl] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState(post?.category_id || '');
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState(post?.updated_at ?? null);
  const [conflict, setConflict] = useState<string | null>(null);

  const editMode = mode === 'edit' && !!post?.id;
  const lock = useEditLock(post?.id, editMode);
  const canSave = !editMode || lockAllowsSave(lock.state);

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/category');
        if (!response.ok) throw new Error('Failed to fetch categories');
        const data = await response.json();
        setCategories(data);

        // Auto-select first category if creating new post and no category selected
        if (mode === 'create' && !categoryId && data.length > 0) {
          setCategoryId(data[0].id);
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
        alert('Failed to load categories. Please refresh the page.');
      } finally {
        setIsLoadingCategories(false);
      }
    };

    fetchCategories();
  }, [mode, categoryId]);

  // Read the browser time zone after mount so the server-rendered markup
  // doesn't mismatch the client.
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Auto-generate slug from title (only in create mode)
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);

    // Auto-generate slug only in create mode and if slug hasn't been manually edited
    if (mode === 'create') {
      const autoSlug = newTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setSlug(autoSlug);
    }
  };

  const uploadFeaturedImage = async (): Promise<string> => {
    // If it's a file, upload via the server
    if (featuredImageFile) {
      return uploadImageViaServer(featuredImageFile, featuredImageFile.name);
    }

    // If it's an external URL, download and upload via the server
    if (isExternalUrl && featuredImageUrl) {
      const response = await fetch(featuredImageUrl);
      if (!response.ok) throw new Error('Failed to download image');

      const blob = await response.blob();
      return uploadImageViaServer(blob, 'featured-image');
    }

    // If it's already a Supabase URL, return as-is
    return featuredImageUrl || '';
  };

  const deleteOldFeaturedImage = async (oldUrl: string | null) => {
    if (!oldUrl) return;

    try {
      // Only delete if it's from our storage (contains 'post-images')
      if (oldUrl.includes('post-images')) {
        await fetch(`/api/uploads?url=${encodeURIComponent(oldUrl)}`, { method: 'DELETE' });
      }
    } catch (error) {
      console.error('Failed to delete old featured image:', error);
      // Don't throw - we can continue even if delete fails
    }
  };

  const handleSubmit = async (overwrite = false) => {
    // Validate required fields
    if (!title || !slug) {
      alert('Title and slug are required');
      return;
    }

    if (editMode && !lockAllowsSave(lock.state)) {
      alert('You are not currently editing this post.');
      return;
    }

    // Check for reserved slugs
    const reservedSlugs = ['admin', 'api', 'category', 'posts', 'styles'];
    if (reservedSlugs.includes(slug.toLowerCase())) {
      alert(`The slug "${slug}" is reserved and cannot be used. Please choose a different slug.`);
      return;
    }

    if (!categoryId) {
      alert('Please select a category');
      return;
    }

    if (!content) {
      alert('Please add some content to your post');
      return;
    }

    const URL_PATTERN = /^https?:\/\/.+\..+/i;
    const hasValidUrl = featuredImageUrl && URL_PATTERN.test(featuredImageUrl);
    const hasFile = !!featuredImageFile;

    if (!hasValidUrl && !hasFile) {
      alert('Please add a valid featured image');
      return;
    }

    // Only validate the schedule when the user actually changed it; an
    // untouched schedule is sent back verbatim (its time may already have
    // passed, in which case the post is simply published now/at that time).
    const scheduleUnchanged =
      publishMode === 'schedule' &&
      post?.published_at != null &&
      scheduleAt === initialScheduleAt;
    if (publishMode === 'schedule' && !scheduleUnchanged) {
      if (!scheduleAt) {
        alert('Please choose a date and time to schedule the post');
        return;
      }
      if (new Date(scheduleAt).getTime() <= Date.now()) {
        alert('The schedule time must be in the future');
        return;
      }
    }

    setIsSaving(true);
    setConflict(null);

    try {
      // Delete old image if it exists and is different
      if (post?.featured_image_url && (featuredImageFile || featuredImageUrl !== post.featured_image_url)) {
        await deleteOldFeaturedImage(post.featured_image_url);
      }

      // Upload new image or use provided URL
      const newFeaturedImageUrl = await uploadFeaturedImage();

      const url = mode === 'create' ? '/api/posts' : `/api/posts/${post?.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const existingPublishedAt = post?.published_at ?? null;
      const publishedAt =
        publishMode === 'draft'
          ? null
          : publishMode === 'schedule'
            ? scheduleUnchanged && existingPublishedAt
              ? existingPublishedAt
              : new Date(scheduleAt).toISOString()
            : existingPublishedAt && new Date(existingPublishedAt).getTime() <= Date.now()
              ? existingPublishedAt
              : new Date().toISOString();

      const payload: Record<string, unknown> = {
        title,
        slug,
        excerpt,
        content_lexical: content,
        featured_image_url: newFeaturedImageUrl,
        published_at: publishedAt,
        category_id: categoryId,
      };

      // Edit mode carries the lock session and the revision this editor loaded,
      // so the server can detect takeovers and conflicting saves atomically.
      if (editMode) {
        if (lock.state.sessionId) {
          payload.lock_session_id = lock.state.sessionId;
        }
        if (!overwrite && loadedUpdatedAt) {
          payload.if_updated_at = loadedUpdatedAt;
        }
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as Record<string, unknown>));

        if (response.status === 409 && errorData.code === 'locked') {
          const holder = errorData.holder as
            | { kind: 'user' | 'agent'; label: string; user_id: string }
            | undefined;
          if (holder) {
            lock.markLost({
              holder,
              acquired_at: (errorData.acquired_at as string) ?? new Date().toISOString(),
              expires_at: (errorData.expires_at as string) ?? new Date().toISOString(),
            });
          }
          return;
        }

        if (response.status === 409 && errorData.code === 'conflict') {
          setConflict((errorData.current_updated_at as string) ?? '');
          return;
        }

        throw new Error(
          (errorData.error as string) || `Failed to ${mode} post`,
        );
      }

      const data = await response.json();
      if (editMode) {
        setLoadedUpdatedAt(data.updated_at ?? loadedUpdatedAt);
        // Release our lock before leaving the page.
        lock.release();
      }
      router.push('/admin');
      router.refresh();
    } catch (error) {
      console.error(`Error ${mode}ing post:`, error);
      const errorMessage = error instanceof Error ? error.message : `Failed to ${mode} post. Please try again.`;
      alert(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const currentStatus = postStatus(post?.published_at ?? null);
  const submitLabel = isSaving
    ? 'Saving...'
    : publishMode === 'draft'
      ? 'Save as Draft'
      : publishMode === 'now'
        ? currentStatus === 'published'
          ? 'Update'
          : 'Publish'
        : currentStatus === 'scheduled'
          ? 'Update'
          : 'Schedule';

  const formatLockTime = (iso: string | null): string => {
    if (!iso) return '';
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? iso
      : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const copyContent = useCallback(() => {
    try {
      void navigator.clipboard?.writeText(JSON.stringify(content ?? null, null, 2));
    } catch {
      // Clipboard access is best-effort.
    }
  }, [content]);

  return (
    <div>
      <Link href="/admin" className="admin-btn admin-btn-ghost -ml-1 mb-4">
        <FiArrowLeft size={16} aria-hidden="true" />
        All posts
      </Link>

      <PageHeader
        eyebrow="Content"
        title={mode === 'create' ? 'New post' : 'Edit post'}
      />

      {/* Edit-lock and conflict alerts, above the form fields at every size */}
      {editMode && lock.state.status === 'unavailable' && (
        <div className="admin-alert admin-alert-info mb-6">
          Live edit locking isn&apos;t enabled on this site (apply the
          post_edit_locks migration). Conflicting saves are still detected.
        </div>
      )}

      {editMode && lock.state.status === 'error' && (
        <div className="admin-alert admin-alert-warning mb-6">
          <p>Couldn&apos;t check whether someone else is editing (retrying…).</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              className="admin-btn admin-btn-secondary"
            >
              Save anyway
            </button>
          </div>
        </div>
      )}

      {editMode && lock.state.status === 'blocked' && lock.state.holder && (
        <div className="admin-alert admin-alert-warning mb-6">
          <p>
            {lock.state.holder.kind === 'agent' ? (
              <>
                An AI agent is editing this post: {lock.state.holder.label},
                since {formatLockTime(lock.state.acquiredAt)}, lease expires{' '}
                {formatLockTime(lock.state.expiresAt)}. If you take over, the
                agent&apos;s pending changes will be rejected and it will report
                that an admin is editing.
              </>
            ) : (
              <>
                {lock.state.holder.label} is editing this post in another
                session since {formatLockTime(lock.state.acquiredAt)}.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void lock.takeOver()}
              className="admin-btn admin-btn-primary"
            >
              Take over editing
            </button>
            <Link href="/admin" className="admin-btn admin-btn-secondary">
              Back to posts
            </Link>
          </div>
        </div>
      )}

      {editMode && lock.state.status === 'lost' && lock.state.holder && (
        <div className="admin-alert admin-alert-error mb-6">
          <p>
            {lock.state.holder.label} took over editing at{' '}
            {formatLockTime(lock.state.acquiredAt)}. Your unsaved changes have
            NOT been saved.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void lock.takeOver()}
              className="admin-btn admin-btn-primary"
            >
              Take back editing
            </button>
            <button
              type="button"
              onClick={copyContent}
              className="admin-btn admin-btn-secondary"
            >
              Copy my content
            </button>
          </div>
        </div>
      )}

      {conflict !== null && (
        <div className="admin-alert admin-alert-warning mb-6">
          <p>This post was changed since you opened it (possibly by an agent).</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSubmit(true)}
              className="admin-btn admin-btn-primary"
            >
              Overwrite their changes
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="admin-btn admin-btn-secondary"
            >
              Reload latest
            </button>
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="admin-label">
              Title *
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={handleTitleChange}
              required
              className="admin-title-input"
              placeholder="Enter post title"
            />
          </div>

          {/* Slug */}
          <div>
            <label htmlFor="slug" className="admin-label">
              Slug *
            </label>
            <div className="flex">
              <span className="inline-flex items-center whitespace-nowrap rounded-l-[var(--radius-control)] border border-rail-strong border-r-0 bg-surface-subtle px-3 font-mono text-sm text-copy-muted">
                blog.34cats.com/
              </span>
              <input
                type="text"
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                className="admin-input min-w-0 rounded-l-none font-mono"
                placeholder="post-url-slug"
              />
            </div>
            {['admin', 'api', 'category', 'posts', 'styles'].includes(slug.toLowerCase()) && (
              <p className="admin-error mt-1">This slug is reserved and cannot be used</p>
            )}
            <p className="admin-hint">URL: /{slug || 'your-post-slug'}</p>
          </div>

          {/* Excerpt */}
          <div>
            <label htmlFor="excerpt" className="admin-label">
              Excerpt
            </label>
            <textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              className="admin-textarea"
              placeholder="Brief description of your post"
            />
          </div>

          {/* Content - Lexical Rich-text Editor */}
          <div>
            <label htmlFor="content" className="admin-label">
              Content
            </label>
            <div className="admin-card admin-card-flush">
              <Editor
                onChange={setContent}
                initialState={post?.content_lexical}
              />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          {/* Publish / Schedule */}
          <div className="admin-card">
            <h2 className="text-lg font-semibold">Publish</h2>
            <fieldset className="mt-4">
              <legend className="admin-label">Publishing</legend>
              <div className="flex flex-col gap-2.5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="publishMode"
                    checked={publishMode === 'draft'}
                    onChange={() => setPublishMode('draft')}
                    className="form-checkbox"
                  />
                  Draft
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="publishMode"
                    checked={publishMode === 'now'}
                    onChange={() => setPublishMode('now')}
                    className="form-checkbox"
                  />
                  Publish now
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="publishMode"
                    checked={publishMode === 'schedule'}
                    onChange={() => setPublishMode('schedule')}
                    className="form-checkbox"
                  />
                  Schedule
                </label>
              </div>
            </fieldset>
            {publishMode === 'schedule' && (
              <div className="mt-3">
                <label htmlFor="scheduleAt" className="admin-label">
                  Date and time
                </label>
                <input
                  type="datetime-local"
                  id="scheduleAt"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="admin-input"
                />
                <p className="admin-hint">
                  {timeZone ? `Time zone: ${timeZone}. ` : ''}
                  {scheduleAt
                    ? `Goes live automatically at ${new Date(scheduleAt).toLocaleString()}.`
                    : 'Goes live automatically at the chosen time.'}
                </p>
              </div>
            )}
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSaving || !canSave}
                className="admin-btn admin-btn-primary w-full"
              >
                {submitLabel}
              </button>
              <Link href="/admin" className="admin-btn admin-btn-secondary w-full">
                Cancel
              </Link>
            </div>
          </div>

          {/* Category */}
          <div className="admin-card">
            <h2 className="text-lg font-semibold">Category</h2>
            <div className="mt-4">
              <label htmlFor="category" className="admin-label">
                Category *
              </label>
              {isLoadingCategories ? (
                <div className="text-sm text-copy-muted">Loading categories...</div>
              ) : categories.length === 0 ? (
                <div className="admin-error">
                  No categories available. Please create a category first.
                </div>
              ) : (
                <select
                  id="category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                  className="admin-select"
                >
                  <option value="">Select a category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Featured Image */}
          <div className="admin-card">
            <FeaturedImageUpload
              value={post?.featured_image_url || null}
              onChange={(url, file, isExternal) => {
                setFeaturedImageUrl(url);
                setFeaturedImageFile(file);
                setIsExternalUrl(isExternal || false);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
