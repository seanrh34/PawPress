import type { SupabaseClient } from '@supabase/supabase-js';
import type { SerializedEditorState } from 'lexical';
import { z } from 'zod';
import {
  findUnsafeUrls,
  isAllowedImageUrl,
  isValidLexicalState,
} from './contentSafety';
import {
  type CategoryRow,
  resolveCategory,
} from './categoryService';
import { markdownToLexical, lexicalToMarkdown, findDisallowedNodeTypes, normalizeLexicalState } from './markdown';
import { ApiError } from './errors';
import { getPostById, type PostCategory, type PostRow } from './postService';
import { MAX_SLUG_LENGTH } from './slug';

/**
 * Shared shapes and validation for the token-authenticated `/api/v1` routes.
 * The responses intentionally never expose `content_lexical` / `content_html`
 * except from `GET /posts/:idOrSlug`.
 */

export const MAX_MARKDOWN_CHARS = 200_000;
export const MAX_LEXICAL_BYTES = 2 * 1024 * 1024;

export interface CategoryResource {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface PostResource {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  status: 'draft' | 'published';
  published_at: string | null;
  category: PostCategory | null;
  featured_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export type ContentFormat = 'markdown' | 'lexical' | 'html';

export function toPostResource(row: PostRow): PostResource {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    status: row.published_at !== null ? 'published' : 'draft',
    published_at: row.published_at,
    category: row.category ?? null,
    featured_image_url: row.featured_image_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toCategoryResource(row: CategoryRow): CategoryResource {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function contentForPost(row: PostRow, format: ContentFormat): unknown {
  if (format === 'lexical') {
    return row.content_lexical ?? null;
  }
  if (format === 'html') {
    return row.content_html ?? '';
  }
  return row.content_lexical ? lexicalToMarkdown(row.content_lexical) : '';
}

/**
 * The insert/update services return a bare `posts` row without the category
 * join, so the resource would lose `category`. Fetch it again when that key is
 * missing; a freshly fetched row keeps its join.
 */
export async function ensurePostCategory(
  db: SupabaseClient,
  row: PostRow,
): Promise<PostRow> {
  if (row.category !== undefined) {
    return row;
  }
  const fresh = await getPostById(db, row.id);
  return fresh ?? row;
}

const titleSchema = z
  .string()
  .min(1, 'Title is required')
  .max(300, 'Title must be at most 300 characters');

const slugSchema = z
  .string()
  .min(1, 'Slug is required')
  .max(MAX_SLUG_LENGTH, `Slug must be at most ${MAX_SLUG_LENGTH} characters`);

const excerptSchema = z
  .string()
  .max(1000, 'Excerpt must be at most 1000 characters');

const contentMarkdownSchema = z
  .string()
  .max(
    MAX_MARKDOWN_CHARS,
    `content_markdown must be at most ${MAX_MARKDOWN_CHARS} characters`,
  );

const contentLexicalSchema = z.unknown();

const postStatusSchema = z.enum(['draft', 'published']);

export const listPostsQuerySchema = z
  .object({
    status: z.enum(['draft', 'published', 'all']).default('all'),
    category: z.string().min(1).optional(),
    q: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  });
// Query schemas strip unknown keys instead of rejecting them: proxies and
// Vercel's protection bypass (?x-vercel-protection-bypass=...) add their own.

export const getPostQuerySchema = z
  .object({
    format: z.enum(['markdown', 'lexical', 'html']).default('markdown'),
  });

export const createPostBodySchema = z
  .object({
    title: titleSchema,
    slug: slugSchema.optional(),
    excerpt: excerptSchema.optional(),
    category: z.string().min(1, 'Category is required'),
    featured_image_url: z.string().nullable().optional(),
    content_markdown: contentMarkdownSchema.optional(),
    content_lexical: contentLexicalSchema.optional(),
    status: postStatusSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasMarkdown = value.content_markdown !== undefined;
    const hasLexical = value.content_lexical !== undefined;

    if (hasMarkdown === hasLexical) {
      ctx.addIssue({
        code: 'custom',
        path: ['content_markdown'],
        message:
          'Provide exactly one of content_markdown or content_lexical',
      });
    }
  });

export const updatePostBodySchema = z
  .object({
    title: titleSchema.optional(),
    slug: slugSchema.optional(),
    excerpt: excerptSchema.optional(),
    category: z.string().min(1, 'Category is required').optional(),
    featured_image_url: z.string().nullable().optional(),
    content_markdown: contentMarkdownSchema.optional(),
    content_lexical: contentLexicalSchema.optional(),
    status: postStatusSchema.optional(),
    if_updated_at: z.string().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.content_markdown !== undefined &&
      value.content_lexical !== undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['content_lexical'],
        message:
          'Provide at most one of content_markdown or content_lexical',
      });
    }

    const hasUpdatableField =
      value.title !== undefined ||
      value.slug !== undefined ||
      value.excerpt !== undefined ||
      value.category !== undefined ||
      value.featured_image_url !== undefined ||
      value.content_markdown !== undefined ||
      value.content_lexical !== undefined ||
      value.status !== undefined;

    if (!hasUpdatableField) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: 'At least one field must be provided',
      });
    }
  });

export const createCategoryBodySchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name is required')
      .max(100, 'Name must be at most 100 characters'),
    slug: slugSchema,
    description: z
      .string()
      .min(1, 'Description is required')
      .max(1000, 'Description must be at most 1000 characters'),
  })
  .strict();

export const updateCategoryBodySchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name is required')
      .max(100, 'Name must be at most 100 characters')
      .optional(),
    slug: slugSchema.optional(),
    description: z
      .string()
      .min(1, 'Description is required')
      .max(1000, 'Description must be at most 1000 characters')
      .optional(),
  })
  .strict();

export interface ContentInput {
  content_markdown?: string;
  content_lexical?: unknown;
}

function assertContentSize(value: unknown): void {
  let size: number;
  try {
    size = new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    throw ApiError.validation('content_lexical is not serializable', {
      fields: { content_lexical: ['Must be a JSON-serializable editor state'] },
    });
  }

  if (size > MAX_LEXICAL_BYTES) {
    throw ApiError.validation('content_lexical is too large', {
      fields: {
        content_lexical: [
          `content_lexical must be at most ${MAX_LEXICAL_BYTES} bytes`,
        ],
      },
    });
  }
}

function assertSafeContent(state: SerializedEditorState): void {
  const issues = findUnsafeUrls(state);
  if (issues.length > 0) {
    throw ApiError.validation('Content contains unsafe URLs', {
      fields: { content: issues.map((issue) => issue.reason) },
      unsafe_urls: issues,
    });
  }
}

/**
 * Resolves the single content field from a v1 body into a Lexical editor state.
 * Markdown is converted server-side; a conversion failure is a validation
 * error. URLs are checked before the state is ever handed to a write.
 */
export function resolveLexicalContent(
  input: ContentInput,
): SerializedEditorState {
  if (input.content_markdown !== undefined) {
    let state: SerializedEditorState;
    try {
      state = markdownToLexical(input.content_markdown);
    } catch (error) {
      console.error('Failed to convert markdown content:', error);
      throw ApiError.validation('content_markdown could not be converted', {
        fields: { content_markdown: ['Invalid markdown content'] },
      });
    }
    assertSafeContent(state);
    return state;
  }

  const value = input.content_lexical;
  if (!isValidLexicalState(value)) {
    throw ApiError.validation('content_lexical is not a valid editor state', {
      fields: {
        content_lexical: ['Must be a serialized Lexical editor state'],
      },
    });
  }

  // Size limit first: never JSON-stringify/parse an unbounded payload.
  assertContentSize(value);

  // Reject anything the web editor cannot render before handing it to Lexical.
  const disallowed = findDisallowedNodeTypes(value);
  if (disallowed.length > 0) {
    throw ApiError.validation('content_lexical contains unsupported nodes', {
      fields: {
        content_lexical: disallowed.map(
          (node) => `Unsupported node type "${node.type}" at ${node.path}`,
        ),
      },
      disallowed_nodes: disallowed,
    });
  }

  // Canonicalise: parse through the editor's own nodes so unknown fields are
  // dropped and every node is re-serialized by its exportJSON().
  let normalized: SerializedEditorState;
  try {
    normalized = normalizeLexicalState(value);
  } catch (error) {
    console.error('Failed to normalize content_lexical:', error);
    throw ApiError.validation('content_lexical is not a valid editor state', {
      fields: {
        content_lexical: ['Must be a serialized Lexical editor state'],
      },
    });
  }

  assertSafeContent(normalized);
  return normalized;
}

export function assertFeaturedImageUrl(
  url: string | null | undefined,
): void {
  if (url === undefined || url === null) {
    return;
  }

  if (!isAllowedImageUrl(url)) {
    throw ApiError.validation(
      'featured_image_url must be an http(s) URL or a site-relative path',
      {
        fields: {
          featured_image_url: [
            'Must be an http(s) URL or a site-relative path; upload images with POST /api/v1/media first',
          ],
        },
      },
    );
  }
}

export async function resolveCategoryOrThrow(
  db: SupabaseClient,
  idOrSlug: string,
): Promise<CategoryRow> {
  const category = await resolveCategory(db, idOrSlug);
  if (!category) {
    throw ApiError.validation('Unknown category', {
      fields: { category: ['Unknown category'] },
    });
  }
  return category;
}
