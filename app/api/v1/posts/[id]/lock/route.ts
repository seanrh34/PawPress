import { NextResponse } from 'next/server';
import { z } from 'zod';
import { audit, withApi } from '@/lib/api/withApi';
import { requiredLockSessionFromHeader } from '@/lib/api/lockSession';
import { AppMetadataTokenStore } from '@/lib/auth/tokenStore';
import { ApiError } from '@/lib/cms/errors';
import { isUuid } from '@/lib/cms/categoryService';
import {
  AGENT_LOCK_TTL_SECONDS,
  MAX_LOCK_TTL_SECONDS,
  MIN_LOCK_TTL_SECONDS,
  acquireLock,
  foreignLockError,
  holderLabel,
  releaseLock,
  toPublicLock,
} from '@/lib/cms/lockService';
import {
  assertScope,
  requiredScopesForPostUpdate,
} from '@/lib/cms/permissions';
import { getPostById } from '@/lib/cms/postService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const lockBodySchema = z
  .object({
    session_id: z.string().optional(),
    ttl_seconds: z
      .number()
      .int()
      .min(MIN_LOCK_TTL_SECONDS)
      .max(MAX_LOCK_TTL_SECONDS)
      .optional(),
  })
  .strict();

/**
 * Looks up the caller's token name so an agent holder is labelled with both the
 * token's name and the owner's email. Falls back to the email alone if the
 * token entry can't be read; never fails the acquisition over the label.
 */
async function tokenNameFor(
  db: Parameters<typeof acquireLock>[0],
  userId: string,
  tokenId: string,
): Promise<string | undefined> {
  try {
    const tokens = await new AppMetadataTokenStore(db).list(userId);
    return tokens.find((token) => token.id === tokenId)?.name;
  } catch (error) {
    console.error('Failed to read token name for lock label:', error);
    return undefined;
  }
}

/** Reads an optional JSON body, treating an empty body as `{}`. */
async function readOptionalJsonBody(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (raw.trim() === '') {
    return {};
  }
  return JSON.parse(raw);
}

export const POST = withApi<{ id: string }>(
  async (req, ctx) => {
    const id = ctx.params.id;
    if (!isUuid(id)) {
      throw ApiError.notFound('Post not found');
    }

    const body = lockBodySchema.parse(await readOptionalJsonBody(req));
    if (body.session_id !== undefined && !isUuid(body.session_id)) {
      throw ApiError.validation('session_id must be a UUID', {
        fields: { session_id: ['Must be a UUID'] },
      });
    }

    const post = await getPostById(ctx.auth.db, id);
    if (!post) {
      throw ApiError.notFound('Post not found');
    }

    // Locking a published/scheduled post needs the same scopes as editing it.
    for (const scope of requiredScopesForPostUpdate(post, {})) {
      assertScope(ctx.auth, scope);
    }

    const tokenId = ctx.auth.via === 'token' ? ctx.auth.tokenId : undefined;
    const tokenName =
      tokenId !== undefined
        ? await tokenNameFor(ctx.auth.db, ctx.auth.userId, tokenId)
        : undefined;

    const result = await acquireLock(ctx.auth.db, {
      postId: id,
      sessionId: body.session_id,
      holder: {
        kind: 'agent',
        userId: ctx.auth.userId,
        tokenId,
        label: holderLabel('agent', ctx.auth.email, tokenName),
      },
      ttlSeconds: body.ttl_seconds ?? AGENT_LOCK_TTL_SECONDS,
      // Tokens can never override an existing holder.
      force: false,
    });

    if (result.locking === 'unavailable') {
      return NextResponse.json({ locking: 'unavailable', lock: null });
    }

    if (!result.acquired) {
      if (result.lock) {
        throw foreignLockError(result.lock, body.session_id);
      }
      throw ApiError.locked('Another editor is editing this post');
    }

    audit(ctx, 'post.lock', 'post', id);

    return NextResponse.json({
      locking: 'enabled',
      lock: toPublicLock(result.lock, result.lock?.session_id),
    });
  },
  { auth: 'token', scope: 'posts:write' },
);

export const DELETE = withApi<{ id: string }>(
  async (req, ctx) => {
    const id = ctx.params.id;
    if (!isUuid(id)) {
      throw ApiError.notFound('Post not found');
    }

    const sessionId = requiredLockSessionFromHeader(req);
    const released = await releaseLock(ctx.auth.db, id, sessionId);
    audit(ctx, 'post.unlock', 'post', id);

    return NextResponse.json({ released });
  },
  { auth: 'token', scope: 'posts:write' },
);
