import { NextResponse } from 'next/server';
import { audit, withApi } from '@/lib/api/withApi';
import { ApiError } from '@/lib/cms/errors';
import { isUuid } from '@/lib/cms/categoryService';
import { unpublishPost } from '@/lib/cms/postService';
import { ensurePostCategory, toPostResource } from '@/lib/cms/v1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApi<{ id: string }>(
  async (_req, ctx) => {
    const id = ctx.params.id;
    if (!isUuid(id)) {
      throw ApiError.notFound('Post not found');
    }

    const unpublished = await unpublishPost(ctx.auth.db, id);
    const post = await ensurePostCategory(ctx.auth.db, unpublished);
    audit(ctx, 'post.unpublish', 'post', post.id);

    return NextResponse.json(toPostResource(post));
  },
  { auth: 'token', scope: 'posts:publish' },
);
