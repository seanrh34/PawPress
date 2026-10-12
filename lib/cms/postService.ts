import type { SupabaseClient } from '@supabase/supabase-js';
import type { SerializedEditorState } from 'lexical';
import { z } from 'zod';
import { lexicalToHtml } from '@/lib/lexicalToHtml';
import { ApiError, fromZodError, isUniqueViolation } from './errors';
import {
  getCategory,
  isUuid,
  resolveCategory,
  type CategoryRow,
} from './categoryService';
import { slugify, validateSlug } from './slug';

export interface PostCategory {
  id: string;
  slug: string;
  name: string;
}

export interface PostRow {
  id: string;
  title: string;
  slug: string;
  content_lexical: SerializedEditorState | null;
  content_html: string;
  excerpt: string;
  featured_image_url: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  category_id: string;
  category?: PostCategory | null;
}

export type PostStatus = 'draft' | 'published';

export interface ListPostsOptions {
  status?: PostStatus | 'all';
  categorySlug?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface ListPostsResult {
  items: PostRow[];
  total: number;
}

export interface CreatePostInput {
  title: string;
  slug?: string;
  excerpt?: string;
  category_id: string;
  featured_image_url?: string | null;
  content_lexical?: SerializedEditorState | null;
  published_at?: string | null;
}

export interface UpdatePostPatch {
  title?: string;
  slug?: string;
  excerpt?: string;
  category_id?: string;
  featured_image_url?: string | null;
  content_lexical?: SerializedEditorState | null;
  published_at?: string | null;
}

export interface UpdatePostOptions {
  ifUpdatedAt?: string;
  /**
   * When true, a Lexical -> HTML conversion failure aborts the update with a
   * 500 instead of leaving the previously stored HTML in place. The v1 API
   * sets this; the web editor's PUT keeps the tolerant default.
   */
  strictHtml?: boolean;
}

const titleSchema = z
  .string()
  .min(1, 'Title is required')
  .max(300, 'Title must be at most 300 characters');

const excerptSchema = z
  .string()
  .max(1000, 'Excerpt must be at most 1000 characters');

const createPostSchema = z.object({
  title: titleSchema,
  slug: z.string().min(1).max(200).optional(),
  excerpt: excerptSchema.optional(),
  category_id: z.string().min(1),
  featured_image_url: z.string().nullable().optional(),
  content_lexical: z.unknown().optional(),
  published_at: z.string().nullable().optional(),
});

const updatePostSchema = z.object({
  title: titleSchema.optional(),
  slug: z.string().min(1).max(200).optional(),
  excerpt: excerptSchema.optional(),
  category_id: z.string().min(1).optional(),
  featured_image_url: z.string().nullable().optional(),
  content_lexical: z.unknown().optional(),
  published_at: z.string().nullable().optional(),
});

function assertValidSlug(slug: string): void {
  const message = validateSlug(slug);
  if (message) {
    throw ApiError.validation(message, { fields: { slug: [message] } });
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function convertToHtml(
  content: SerializedEditorState,
): Promise<string> {
  try {
    return await lexicalToHtml(content);
  } catch (error) {
    console.error('Failed to convert content to HTML:', error);
    throw ApiError.internal(
      'Failed to convert content to HTML. Please try again.',
    );
  }
}

export async function listPosts(
  db: SupabaseClient,
  options: ListPostsOptions = {},
): Promise<ListPostsResult> {
  const {
    status = 'all',
    categorySlug,
    q,
    limit = 20,
    offset = 0,
  } = options;

  let category: CategoryRow | null = null;
  if (categorySlug !== undefined) {
    category = await resolveCategory(db, categorySlug);
    if (!category) {
      return { items: [], total: 0 };
    }
  }

  let query = db
    .from('posts')
    .select('*, category:categories(id, slug, name)', { count: 'exact' });

  if (status === 'published') {
    query = query.not('published_at', 'is', null);
  } else if (status === 'draft') {
    query = query.is('published_at', null);
  }

  if (category) {
    query = query.eq('category_id', category.id);
  }

  if (q !== undefined && q !== '') {
    query = query.ilike('title', `%${escapeLikePattern(q)}%`);
  }

  query = query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Failed to list posts:', error);
    throw ApiError.internal();
  }

  return { items: (data ?? []) as PostRow[], total: count ?? 0 };
}

export async function getPostById(
  db: SupabaseClient,
  id: string,
): Promise<PostRow | null> {
  const { data, error } = await db
    .from('posts')
    .select('*, category:categories(id, slug, name)')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch post:', error);
    throw ApiError.internal();
  }

  return (data as PostRow | null) ?? null;
}

export async function getPostBySlug(
  db: SupabaseClient,
  slug: string,
): Promise<PostRow | null> {
  const { data, error } = await db
    .from('posts')
    .select('*, category:categories(id, slug, name)')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch post:', error);
    throw ApiError.internal();
  }

  return (data as PostRow | null) ?? null;
}

export async function getPost(
  db: SupabaseClient,
  idOrSlug: string,
): Promise<PostRow | null> {
  return isUuid(idOrSlug)
    ? getPostById(db, idOrSlug)
    : getPostBySlug(db, idOrSlug);
}

export async function createPost(
  db: SupabaseClient,
  input: CreatePostInput,
): Promise<PostRow> {
  if (!input.title) {
    throw ApiError.validation('Title and slug are required');
  }

  if (!input.category_id) {
    throw ApiError.validation('Category is required');
  }

  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) {
    throw fromZodError(parsed.error);
  }

  let slug = parsed.data.slug;
  if (slug === undefined) {
    slug = slugify(parsed.data.title);
  }
  assertValidSlug(slug);

  const category = await getCategory(db, parsed.data.category_id);
  if (!category) {
    throw ApiError.validation('Invalid category');
  }

  let content_html = '';
  if (parsed.data.content_lexical) {
    content_html = await convertToHtml(
      parsed.data.content_lexical as SerializedEditorState,
    );
  }

  const { data, error } = await db
    .from('posts')
    .insert([
      {
        title: parsed.data.title,
        slug,
        content_lexical: parsed.data.content_lexical ?? null,
        content_html,
        excerpt: parsed.data.excerpt ?? '',
        featured_image_url: parsed.data.featured_image_url ?? null,
        published_at: parsed.data.published_at ?? null,
        category_id: parsed.data.category_id,
      },
    ])
    .select()
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      throw ApiError.conflict('A post with this slug already exists');
    }
    console.error('Failed to create post:', error);
    throw ApiError.internal();
  }

  return data as PostRow;
}

export async function updatePost(
  db: SupabaseClient,
  id: string,
  patch: UpdatePostPatch,
  opts: UpdatePostOptions = {},
): Promise<PostRow> {
  const ifUpdatedAt = opts.ifUpdatedAt;

  if (ifUpdatedAt !== undefined && Number.isNaN(Date.parse(ifUpdatedAt))) {
    throw ApiError.validation('if_updated_at must be a valid ISO timestamp', {
      fields: { if_updated_at: ['Must be a valid ISO timestamp'] },
    });
  }

  const current = await getPostById(db, id);
  if (!current) {
    throw ApiError.notFound('Post not found');
  }

  // Fast path: avoid a write attempt when we already know it would fail. The
  // conditional UPDATE below is the authoritative check.
  if (ifUpdatedAt !== undefined && ifUpdatedAt !== current.updated_at) {
    throw ApiError.conflict('The post was modified by someone else', {
      current_updated_at: current.updated_at,
    });
  }

  const parsed = updatePostSchema.safeParse(patch);
  if (!parsed.success) {
    throw fromZodError(parsed.error);
  }

  const update: Record<string, unknown> = {};

  if (parsed.data.title !== undefined) update.title = parsed.data.title;

  if (parsed.data.slug !== undefined) {
    assertValidSlug(parsed.data.slug);
    update.slug = parsed.data.slug;
  }

  if (parsed.data.excerpt !== undefined) update.excerpt = parsed.data.excerpt;

  if (parsed.data.featured_image_url !== undefined) {
    update.featured_image_url = parsed.data.featured_image_url;
  }

  if (parsed.data.published_at !== undefined) {
    update.published_at = parsed.data.published_at;
  }

  if (parsed.data.category_id !== undefined) {
    const category = await getCategory(db, parsed.data.category_id);
    if (!category) {
      throw ApiError.validation('Invalid category');
    }
    update.category_id = parsed.data.category_id;
  }

  if (parsed.data.content_lexical !== undefined) {
    const content = parsed.data.content_lexical as SerializedEditorState | null;
    update.content_lexical = content ?? null;
    if (content) {
      try {
        update.content_html = await lexicalToHtml(content);
      } catch (error) {
        console.error('Failed to convert content to HTML:', error);
        if (opts.strictHtml) {
          throw ApiError.internal(
            'Failed to convert content to HTML. Please try again.',
          );
        }
        // Leave content_html untouched rather than failing the update; this
        // matches the web PUT contract.
      }
    } else {
      update.content_html = '';
    }
  }

  update.updated_at = new Date().toISOString();

  let mutation = db.from('posts').update(update).eq('id', id);
  if (ifUpdatedAt !== undefined) {
    // Optimistic concurrency: the write only lands if the row still has the
    // revision the client last saw.
    mutation = mutation.eq('updated_at', ifUpdatedAt);
  }

  const { data, error } = await mutation.select().maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      throw ApiError.conflict('A post with this slug already exists');
    }
    console.error('Failed to update post:', error);
    throw ApiError.internal();
  }

  if (!data) {
    if (ifUpdatedAt !== undefined) {
      const fresh = await getPostById(db, id);
      if (!fresh) {
        throw ApiError.notFound('Post not found');
      }
      throw ApiError.conflict('The post was modified by someone else', {
        current_updated_at: fresh.updated_at,
      });
    }
    throw ApiError.notFound('Post not found');
  }

  return data as PostRow;
}

export async function publishPost(
  db: SupabaseClient,
  id: string,
): Promise<PostRow> {
  const current = await getPostById(db, id);
  if (!current) {
    throw ApiError.notFound('Post not found');
  }

  const { data, error } = await db
    .from('posts')
    .update({
      published_at: current.published_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Failed to publish post:', error);
    throw ApiError.internal();
  }

  if (!data) {
    throw ApiError.notFound('Post not found');
  }

  return data as PostRow;
}

export async function unpublishPost(
  db: SupabaseClient,
  id: string,
): Promise<PostRow> {
  const current = await getPostById(db, id);
  if (!current) {
    throw ApiError.notFound('Post not found');
  }

  const { data, error } = await db
    .from('posts')
    .update({
      published_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Failed to unpublish post:', error);
    throw ApiError.internal();
  }

  if (!data) {
    throw ApiError.notFound('Post not found');
  }

  return data as PostRow;
}

export async function deletePost(
  db: SupabaseClient,
  id: string,
): Promise<void> {
  const current = await getPostById(db, id);
  if (!current) {
    throw ApiError.notFound('Post not found');
  }

  const { error } = await db.from('posts').delete().eq('id', id);

  if (error) {
    console.error('Failed to delete post:', error);
    throw ApiError.internal();
  }
}
