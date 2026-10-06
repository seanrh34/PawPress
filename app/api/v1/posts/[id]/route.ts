import { NextResponse } from 'next/server';
import { audit, withApi } from '@/lib/api/withApi';
import { ApiError } from '@/lib/cms/errors';
import { isUuid } from '@/lib/cms/categoryService';
import {
  assertScope,
  requiredScopesForPostUpdate,
} from '@/lib/cms/permissions';
import {
  deletePost,
  getPost,
  getPostById,
  updatePost,
  type UpdatePostPatch,
} from '@/lib/cms/postService';
import {
  assertFeaturedImageUrl,
  contentForPost,
  ensurePostCategory,
  getPostQuerySchema,
  resolveCategoryOrThrow,
  resolveLexicalContent,
  toPostResource,
  updatePostBodySchema,
} from '@/lib/cms/v1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApi<{ id: string }>(
  async (req, ctx) => {
    const url = new URL(req.url);
    const { format } = getPostQuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );

    const post = await getPost(ctx.auth.db, ctx.params.id);
    if (!post) {
      throw ApiError.notFound('Post not found');
    }

    return NextResponse.json({
      ...toPostResource(post),
      content: contentForPost(post, format),
      content_format: format,
    });
  },
  { auth: 'token', scope: 'posts:read' },
);

export const PATCH = withApi<{ id: string }>(
  async (req, ctx) => {
    const id = ctx.params.id;
    if (!isUuid(id)) {
      throw ApiError.notFound('Post not found');
    }

    const body = updatePostBodySchema.parse(await req.json());

    const current = await getPostById(ctx.auth.db, id);
    if (!current) {
      throw ApiError.notFound('Post not found');
    }

    for (const scope of requiredScopesForPostUpdate(current, {
      status: body.status,
    })) {
      assertScope(ctx.auth, scope);
    }

    assertFeaturedImageUrl(body.featured_image_url);

    const patch: UpdatePostPatch = {};

    if (body.title !== undefined) patch.title = body.title;
    if (body.slug !== undefined) patch.slug = body.slug;
    if (body.excerpt !== undefined) patch.excerpt = body.excerpt;
    if (body.featured_image_url !== undefined) {
      patch.featured_image_url = body.featured_image_url;
    }

    if (body.category !== undefined) {
      const category = await resolveCategoryOrThrow(ctx.auth.db, body.category);
      patch.category_id = category.id;
    }

    if (
      body.content_markdown !== undefined ||
      body.content_lexical !== undefined
    ) {
      patch.content_lexical = resolveLexicalContent(body);
    }

    if (body.status === 'published') {
      patch.published_at = current.published_at ?? new Date().toISOString();
    } else if (body.status === 'draft') {
      patch.published_at = null;
    }

    const updated = await updatePost(ctx.auth.db, id, patch, {
      ifUpdatedAt: body.if_updated_at,
    });
    const post = await ensurePostCategory(ctx.auth.db, updated);
    audit(ctx, 'post.update', 'post', post.id);

    return NextResponse.json(toPostResource(post));
  },
  { auth: 'token', scope: 'posts:write' },
);

export const DELETE = withApi<{ id: string }>(
  async (_req, ctx) => {
    const id = ctx.params.id;
    if (!isUuid(id)) {
      throw ApiError.notFound('Post not found');
    }

    await deletePost(ctx.auth.db, id);
    audit(ctx, 'post.delete', 'post', id);

    return NextResponse.json({ deleted: true, id });
  },
  { auth: 'token', scope: 'posts:delete' },
);
