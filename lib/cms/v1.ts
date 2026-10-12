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
import { markdownToLexical, lexicalToMarkdown, findDisallowedNodeTypes, normalizeLexicalState, MarkdownBlockTooLongError } from './markdown';
import { ApiError } from './errors';
import { getPostById, type PostCategory, type PostRow } from './postService';
import { postStatus, type PostStatus } from './status';
import { MAX_SLUG_LENGTH } from './slug';

/**
 * Shared shapes and validation for the token-authenticated `/api/v1` routes.
 * The responses intentionally never expose `content_lexical` / `content_html`
 * except from `GET /posts/:idOrSlug`.
 */

export const MAX_MARKDOWN_CHARS = 200_000;
export const MAX_LEXICAL_BYTES = 2 * 1024 * 1024;

/**
 * An ISO-8601 timestamp with an explicit UTC offset or `Z`. Local times
 * (no offset) are rejected so a schedule is unambiguous.
 */
const ISO_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

const MAX_SCHEDULE_MS = 365 * 24 * 60 * 60 * 1000;

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
  status: PostStatus;
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
    status: postStatus(row.published_at),
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

const postStatusSchema = z.enum(['draft', 'published', 'scheduled']);

export const listPostsQuerySchema = z
  .object({
    status: z.enum(['draft', 'published', 'scheduled', 'all']).default('all'),
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
    publish_at: z.string().optional(),
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

    if (value.status === 'scheduled' && value.publish_at === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['publish_at'],
        message: 'publish_at is required when status is "scheduled"',
      });
    }

    if (value.publish_at !== undefined && value.status !== 'scheduled') {
      ctx.addIssue({
        code: 'custom',
        path: ['publish_at'],
        message: 'publish_at is only allowed when status is "scheduled"',
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
    publish_at: z.string().optional(),
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
      value.status !== undefined ||
      value.publish_at !== undefined;

    if (!hasUpdatableField) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: 'At least one field must be provided',
      });
    }
  });

export const publishPostBodySchema = z
  .object({
    at: z.string().optional(),
  })
  .strict();

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
 * Converts v1 markdown to a Lexical state, mapping the known failure modes to
 * `validation_failed`. Never logs the error: it can embed submitted content.
 */
function convertMarkdown(markdown: string): SerializedEditorState {
  try {
    return markdownToLexical(markdown);
  } catch (error) {
    if (error instanceof MarkdownBlockTooLongError) {
      throw ApiError.validation(error.message, {
        fields: { content_markdown: [error.message] },
      });
    }
    if (error instanceof RangeError) {
      throw ApiError.validation('content_markdown is too complex to convert', {
        fields: {
          content_markdown: [
            'Markdown is too repetitive or deeply nested to convert',
          ],
        },
      });
    }
    throw ApiError.validation('content_markdown could not be converted', {
      fields: { content_markdown: ['Invalid markdown content'] },
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
    const state = convertMarkdown(input.content_markdown);
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
    // Do not log the error: it can embed submitted content. A RangeError
    // (stack overflow on deeply nested input) is still a bad-input problem.
    if (error instanceof RangeError) {
      throw ApiError.validation('content_lexical is too deeply nested', {
        fields: {
          content_lexical: ['Editor state is too deeply nested to convert'],
        },
      });
    }
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

function invalidPublishAt(field: string, message: string): ApiError {
  return ApiError.validation(message, { fields: { [field]: [message] } });
}

/**
 * Validates a `publish_at` / `at` value: an ISO-8601 timestamp with an explicit
 * offset or `Z`, strictly in the future and at most 365 days ahead. `field`
 * names the offending body key in the error details.
 */
export function parsePublishAt(
  value: string,
  field = 'publish_at',
  now: Date = new Date(),
): Date {
  const formatMessage = `${field} must be an ISO-8601 timestamp with an explicit offset or Z (e.g. 2026-10-20T09:00:00+08:00)`;

  if (!ISO_OFFSET_PATTERN.test(value)) {
    throw invalidPublishAt(field, formatMessage);
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw invalidPublishAt(field, formatMessage);
  }

  if (parsed <= now.getTime()) {
    throw invalidPublishAt(field, `${field} must be in the future`);
  }

  if (parsed > now.getTime() + MAX_SCHEDULE_MS) {
    throw invalidPublishAt(
      field,
      `${field} must be at most 365 days in the future`,
    );
  }

  return new Date(parsed);
}

/**
 * Resolves the stored `published_at` for a create from its `status` and
 * `publish_at`: `null` for a draft, now for published, and the parsed instant
 * for scheduled.
 */
export function resolveCreatePublishedAt(
  input: { status?: PostStatus; publish_at?: string },
  now: Date = new Date(),
): string | null {
  if (input.status === 'published') {
    return now.toISOString();
  }
  if (input.status === 'scheduled') {
    if (input.publish_at === undefined) {
      throw invalidPublishAt(
        'publish_at',
        'publish_at is required when status is "scheduled"',
      );
    }
    return parsePublishAt(input.publish_at, 'publish_at', now).toISOString();
  }
  return null;
}

/**
 * Resolves the `published_at` change for a PATCH. Returns `undefined` when the
 * status is untouched, or `null` to clear it. A bare `publish_at` (without
 * `status`) is only allowed to reschedule a post that is already scheduled.
 */
export function resolveUpdatePublishedAt(
  input: { status?: PostStatus; publish_at?: string },
  current: { published_at: string | null },
  now: Date = new Date(),
): string | null | undefined {
  if (input.status === 'draft') {
    return null;
  }

  if (input.status === 'published') {
    if (current.published_at !== null) {
      const ts = Date.parse(current.published_at);
      if (!Number.isNaN(ts) && ts <= now.getTime()) {
        return current.published_at;
      }
    }
    return now.toISOString();
  }

  if (input.status === 'scheduled') {
    if (input.publish_at === undefined) {
      throw invalidPublishAt(
        'publish_at',
        'publish_at is required when status is "scheduled"',
      );
    }
    return parsePublishAt(input.publish_at, 'publish_at', now).toISOString();
  }

  if (input.publish_at !== undefined) {
    if (postStatus(current.published_at, now) !== 'scheduled') {
      throw invalidPublishAt(
        'publish_at',
        'publish_at can only be used without status on a scheduled post; set status to "scheduled"',
      );
    }
    return parsePublishAt(input.publish_at, 'publish_at', now).toISOString();
  }

  return undefined;
}
