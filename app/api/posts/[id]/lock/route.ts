import { NextResponse } from 'next/server';
import { isUuid } from '@/lib/cms/categoryService';
import {
  USER_LOCK_TTL_SECONDS,
  acquireLock,
  toPublicLock,
} from '@/lib/cms/lockService';
import { getPostById } from '@/lib/cms/postService';
import {
  WebResponseError,
  requireWebLockSession,
  webErrorResponse,
} from '@/lib/api/webLock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LockBody {
  session_id?: string;
  force?: boolean;
}

async function readBody(request: Request): Promise<LockBody> {
  const raw = await request.text();
  if (raw.trim() === '') {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new WebResponseError(
      NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    );
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return {};
  }
  return parsed as LockBody;
}

/**
 * Acquires, renews (same `session_id`), or — for humans — takes over (`force`)
 * the post's edit lock. Additive legacy-style JSON so the existing editor can
 * ignore `locking`/`acquired` if it does not use them.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, userId, email } = await requireWebLockSession(request);
    const { id } = await params;

    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const body = await readBody(request);
    if (body.session_id !== undefined && !isUuid(body.session_id)) {
      return NextResponse.json(
        { error: 'session_id must be a UUID' },
        { status: 400 },
      );
    }

    const post = await getPostById(db, id);
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const result = await acquireLock(db, {
      postId: id,
      sessionId: body.session_id,
      holder: { kind: 'user', userId, label: email },
      ttlSeconds: USER_LOCK_TTL_SECONDS,
      // Humans may take over anyone's lock.
      force: body.force === true,
    });

    if (result.locking === 'unavailable') {
      return NextResponse.json({ locking: 'unavailable', acquired: false, lock: null });
    }

    const viewer = result.acquired ? result.lock?.session_id : body.session_id;
    return NextResponse.json({
      locking: 'enabled',
      acquired: result.acquired,
      lock: toPublicLock(result.lock, viewer),
    });
  } catch (error) {
    return webErrorResponse('acquire edit lock', error);
  }
}
