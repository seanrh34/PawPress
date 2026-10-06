import { NextResponse } from 'next/server';
import { audit, withApi } from '@/lib/api/withApi';
import {
  assertScope,
  requiredScopesForPostCreate,
} from '@/lib/cms/permissions';
import { createPost, listPosts } from '@/lib/cms/postService';
import {
  assertFeaturedImageUrl,
  createPostBodySchema,
  ensurePostCategory,
  listPostsQuerySchema,
  resolveCategoryOrThrow,
  resolveLexicalContent,
  toPostResource,
} from '@/lib/cms/v1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApi(
  async (req, ctx) => {
    const url = new URL(req.url);
    const query = listPostsQuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );

    const result = await listPosts(ctx.auth.db, {
      status: query.status,
      categorySlug: query.category,
      q: query.q,
      limit: query.limit,
      offset: query.offset,
    });

    return NextResponse.json({
      items: result.items.map(toPostResource),
      total: result.total,
    });
  },
  { auth: 'token', scope: 'posts:read' },
);

export const POST = withApi(
  async (req, ctx) => {
    const body = createPostBodySchema.parse(await req.json());

    for (const scope of requiredScopesForPostCreate({ status: body.status })) {
      assertScope(ctx.auth, scope);
    }

    assertFeaturedImageUrl(body.featured_image_url);
    const content = resolveLexicalContent(body);
    const category = await resolveCategoryOrThrow(ctx.auth.db, body.category);

    const created = await createPost(ctx.auth.db, {
      title: body.title,
      slug: body.slug,
      excerpt: body.excerpt ?? '',
      category_id: category.id,
      featured_image_url: body.featured_image_url ?? null,
      content_lexical: content,
      published_at:
        body.status === 'published' ? new Date().toISOString() : null,
    });

    const post = await ensurePostCategory(ctx.auth.db, created);
    audit(ctx, 'post.create', 'post', post.id);

    return NextResponse.json(toPostResource(post), { status: 201 });
  },
  { auth: 'token', scope: 'posts:write' },
);
