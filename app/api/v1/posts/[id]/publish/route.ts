import { NextResponse } from 'next/server';
import { audit, withApi } from '@/lib/api/withApi';
import { ApiError } from '@/lib/cms/errors';
import { isUuid } from '@/lib/cms/categoryService';
import { publishPost } from '@/lib/cms/postService';
import {
  ensurePostCategory,
  parsePublishAt,
  publishPostBodySchema,
  toPostResource,
} from '@/lib/cms/v1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApi<{ id: string }>(
  async (req, ctx) => {
    const id = ctx.params.id;
    if (!isUuid(id)) {
      throw ApiError.notFound('Post not found');
    }

    // The body is optional: no body (or an empty one) publishes now.
    const raw = await req.text();
    let at: Date | undefined;
    if (raw.trim() !== '') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw ApiError.validation('Invalid JSON body');
      }
      const body = publishPostBodySchema.parse(parsed);
      if (body.at !== undefined) {
        at = parsePublishAt(body.at, 'at');
      }
    }

    const published = await publishPost(ctx.auth.db, id, at ? { at } : {});
    const post = await ensurePostCategory(ctx.auth.db, published);
    audit(ctx, 'post.publish', 'post', post.id);

    return NextResponse.json(toPostResource(post));
  },
  { auth: 'token', scope: 'posts:publish' },
);
