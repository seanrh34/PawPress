'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Editor from '@/components/Editor';
import FeaturedImageUpload from '@/components/FeaturedImageUpload';
import { SerializedEditorState } from 'lexical';
import { Post, Category } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface PostEditorProps {
  post?: Post;
  mode: 'create' | 'edit';
}

export default function PostEditor({ post, mode }: PostEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title || '');
  const [slug, setSlug] = useState(post?.slug || '');
  const [excerpt, setExcerpt] = useState(post?.excerpt || '');
  const [content, setContent] = useState<SerializedEditorState | null>(post?.content_lexical || null);
  const [isPublished, setIsPublished] = useState(!!post?.published_at);
  const [isSaving, setIsSaving] = useState(false);
  const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(post?.featured_image_url || null);
  const [featuredImageFile, setFeaturedImageFile] = useState<File>();
  const [isExternalUrl, setIsExternalUrl] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState(post?.category_id || '');
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

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

  const handleSubmit = async () => {
    // Validate required fields
    if (!title || !slug) {
      alert('Title and slug are required');
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

    setIsSaving(true);

    try {
      // Delete old image if it exists and is different
      if (post?.featured_image_url && (featuredImageFile || featuredImageUrl !== post.featured_image_url)) {
        await deleteOldFeaturedImage(post.featured_image_url);
      }

      // Upload new image or use provided URL
      const newFeaturedImageUrl = await uploadFeaturedImage();

      const url = mode === 'create' ? '/api/posts' : `/api/posts/${post?.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          slug,
          excerpt,
          content_lexical: content,
          featured_image_url: newFeaturedImageUrl,
          published_at: isPublished ? (post?.published_at || new Date().toISOString()) : null,
          category_id: categoryId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${mode} post`);
      }

      const data = await response.json();
      router.push('/admin');
      router.refresh();
    } catch (error) {
      console.error(`Error ${mode}ing post:`, error);
      alert(`Failed to ${mode} post. Please try again.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          {mode === 'create' ? 'Create New Post' : 'Edit Post'}
        </h1>

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

          {/* Publish Toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isPublished"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="form-checkbox"
            />
            <label htmlFor="isPublished" className="form-label mb-0">
              {mode === 'create' ? 'Publish immediately' : 'Published'}
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="btn-primary"
            >
              {isSaving ? 'Saving...' : mode === 'create' ? (isPublished ? 'Publish Post' : 'Save as Draft') : 'Update Post'}
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
