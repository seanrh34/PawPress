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
import { supabase } from '@/lib/supabase';

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
    // If it's a file, upload to Supabase
    if (featuredImageFile) {
      try {
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        const extension = featuredImageFile.name.split('.').pop() || 'jpg';
        const fileName = `featured-${timestamp}-${randomStr}.${extension}`;

        const { data, error } = await supabase.storage
          .from('post-images')
          .upload(fileName, featuredImageFile, {
            contentType: featuredImageFile.type,
            cacheControl: '3600',
            upsert: false
          });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('post-images')
          .getPublicUrl(data.path);

        return publicUrl;
      } catch (error) {
        console.error('Failed to upload featured image:', error);
        throw new Error('Failed to upload featured image');
      }
    }

    // If it's an external URL, download and upload to Supabase
    if (isExternalUrl && featuredImageUrl) {
      try {
        // Download the image
        const response = await fetch(featuredImageUrl);
        if (!response.ok) throw new Error('Failed to download image');
        
        const blob = await response.blob();
        
        // Determine file extension from content type or URL
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        let extension = contentType.split('/')[1]?.split(';')[0] || 'jpg';
        if (extension === 'jpeg') extension = 'jpg';
        
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        const fileName = `featured-${timestamp}-${randomStr}.${extension}`;

        const { data, error } = await supabase.storage
          .from('post-images')
          .upload(fileName, blob, {
            contentType: contentType,
            cacheControl: '3600',
            upsert: false
          });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('post-images')
          .getPublicUrl(data.path);

        return publicUrl;
      } catch (error) {
        console.error('Failed to download and upload featured image:', error);
        throw new Error('Failed to download and upload featured image');
      }
    }

    // If it's already a Supabase URL, return as-is
    return featuredImageUrl || '';
  };

  const deleteOldFeaturedImage = async (oldUrl: string | null) => {
    if (!oldUrl) return;

    try {
      // Extract filename from URL
      const urlParts = oldUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];

      // Only delete if it's from our storage (contains 'post-images')
      if (oldUrl.includes('post-images')) {
        await supabase.storage
          .from('post-images')
          .remove([fileName]);
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

    if (publishMode === 'schedule') {
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
            ? new Date(scheduleAt).toISOString()
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
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          {mode === 'create' ? 'Create New Post' : 'Edit Post'}
        </h1>

        {editMode && lock.state.status === 'unavailable' && (
          <div className="mb-6 rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-700">
            Live edit locking isn&apos;t enabled on this site (apply the
            post_edit_locks migration). Conflicting saves are still detected.
          </div>
        )}

        {editMode && lock.state.status === 'blocked' && lock.state.holder && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
            <p className="text-sm">
              {lock.state.holder.kind === 'agent' ? (
                <>
                  🤖 An AI agent is editing this post: {lock.state.holder.label},
                  since {formatLockTime(lock.state.acquiredAt)}, lease expires{' '}
                  {formatLockTime(lock.state.expiresAt)}. If you take over, the
                  agent&apos;s pending changes will be rejected and it will report
                  that an admin is editing.
                </>
              ) : (
                <>
                  👤 {lock.state.holder.label} is editing this post in another
                  session since {formatLockTime(lock.state.acquiredAt)}.
                </>
              )}
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => void lock.takeOver()}
                className="btn-primary"
              >
                Take over editing
              </button>
              <Link href="/admin" className="btn-secondary">
                Back to posts
              </Link>
            </div>
          </div>
        )}

        {editMode && lock.state.status === 'lost' && lock.state.holder && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900">
            <p className="text-sm">
              {lock.state.holder.label} took over editing at{' '}
              {formatLockTime(lock.state.acquiredAt)}. Your unsaved changes have
              NOT been saved.
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => void lock.takeOver()}
                className="btn-primary"
              >
                Take back editing
              </button>
              <button
                type="button"
                onClick={copyContent}
                className="btn-secondary"
              >
                Copy my content
              </button>
            </div>
          </div>
        )}

        {conflict !== null && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
            <p className="text-sm">
              This post was changed since you opened it (possibly by an agent).
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => void handleSubmit(true)}
                className="btn-primary"
              >
                Overwrite their changes
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-secondary"
              >
                Reload latest
              </button>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="form-label">
              Title *
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={handleTitleChange}
              required
              className="form-input"
              placeholder="Enter post title"
            />
          </div>

          {/* Slug */}
          <div>
            <label htmlFor="slug" className="form-label">
              Slug *
            </label>
            <input
              type="text"
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              className="form-input"
              placeholder="post-url-slug"
            />
            {['admin', 'api', 'category', 'posts', 'styles'].includes(slug.toLowerCase()) && (
              <p className="text-red-600 text-sm mt-1">
                ⚠️ This slug is reserved and cannot be used
              </p>
            )}
            <p className="form-hint">
              URL: /{slug || 'your-post-slug'}
            </p>
          </div>

          {/* Excerpt */}
          <div>
            <label htmlFor="excerpt" className="form-label">
              Excerpt
            </label>
            <textarea
              id="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              className="form-textarea"
              placeholder="Brief description of your post"
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="form-label">
              Category *
            </label>
            {isLoadingCategories ? (
              <div className="text-sm text-gray-500">Loading categories...</div>
            ) : categories.length === 0 ? (
              <div className="text-sm text-red-600">
                No categories available. Please create a category first.
              </div>
            ) : (
              <select
                id="category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className="form-input"
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

          {/* Featured Image */}
          <FeaturedImageUpload
            value={post?.featured_image_url || null}
            onChange={(url, file, isExternal) => {
              setFeaturedImageUrl(url);
              setFeaturedImageFile(file);
              setIsExternalUrl(isExternal || false);
            }}
          />

          {/* Content - Lexical Rich-text Editor */}
          <div className='text-black'>
            <label htmlFor="content" className="form-label">
              Content
            </label>
            <Editor 
              onChange={setContent}
              initialState={post?.content_lexical}
            />
          </div>

          {/* Publish / Schedule */}
          <div className="space-y-2">
            <span className="form-label">Publishing</span>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="publishMode"
                  checked={publishMode === 'draft'}
                  onChange={() => setPublishMode('draft')}
                  className="form-checkbox"
                />
                Draft
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="publishMode"
                  checked={publishMode === 'now'}
                  onChange={() => setPublishMode('now')}
                  className="form-checkbox"
                />
                Publish now
              </label>
              <label className="flex items-center gap-2">
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
            {publishMode === 'schedule' && (
              <div className="mt-2">
                <input
                  type="datetime-local"
                  id="scheduleAt"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="form-input"
                />
                <p className="form-hint">
                  {timeZone ? `Time zone: ${timeZone}. ` : ''}
                  {scheduleAt
                    ? `Goes live automatically at ${new Date(scheduleAt).toLocaleString()}.`
                    : 'Goes live automatically at the chosen time.'}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSaving || !canSave}
              className="btn-primary"
            >
              {submitLabel}
            </button>
            <Link
              href="/admin"
              className="btn-secondary"
            >
              Cancel
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
