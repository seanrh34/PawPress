import { NextResponse } from 'next/server';
import { isUuid } from '@/lib/cms/categoryService';
import { releaseLock } from '@/lib/cms/lockService';
import { requireWebLockSession, webErrorResponse } from '@/lib/api/webLock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Releases the caller's own session lock. The editor reaches this with
 * `navigator.sendBeacon`, so the body may arrive as `text/plain` JSON; parse
 * `request.text()` rather than assuming a JSON content type.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requireWebLockSession(request);
    const { id } = await params;

    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const raw = await request.text();
    let sessionId: unknown;
    if (raw.trim() !== '') {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          sessionId = (parsed as { session_id?: unknown }).session_id;
        }
      } catch {
        return NextResponse.json(
          { error: 'Invalid JSON body' },
          { status: 400 },
        );
      }
    }

    if (typeof sessionId !== 'string' || !isUuid(sessionId)) {
      return NextResponse.json(
        { error: 'session_id must be a UUID' },
        { status: 400 },
      );
    }

    const released = await releaseLock(db, id, sessionId);
    return NextResponse.json({ released });
  } catch (error) {
    return webErrorResponse('release edit lock', error);
  }
}
