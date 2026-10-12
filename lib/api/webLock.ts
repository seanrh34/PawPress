import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getUser } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/auth/context';
import { ApiError } from '@/lib/cms/errors';
import { createAdminClient } from '@/lib/supabase-admin';

/**
 * A denied web request, carrying the already-built legacy-style response. Web
 * lock routes use additive JSON (not the v1 error envelope), so they can't use
 * `withApi`; this keeps the auth/origin/role checks in one place.
 */
export class WebResponseError extends Error {
  constructor(readonly response: NextResponse) {
    super('web request rejected');
    this.name = 'WebResponseError';
  }
}

export interface WebLockSession {
  userId: string;
  email: string;
  /** Service-role client: the lock table has no RLS policies. */
  db: SupabaseClient;
}

function unauthorized(): WebResponseError {
  return new WebResponseError(
    NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  );
}

export interface WebSessionUser {
  id: string;
  email?: string | null;
}

/**
 * Verifies that a signed-in user still has a `master`/`admin` `user_profiles`
 * row, building the service-role client the privileged callers need. The 401
 * uses the legacy `{ error: 'Unauthorized' }` shape.
 */
export async function requireAdminProfile(
  user: WebSessionUser,
): Promise<WebLockSession> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = (data as { role?: unknown } | null)?.role;
  if (error || (role !== 'master' && role !== 'admin')) {
    throw unauthorized();
  }

  return { userId: user.id, email: user.email ?? '', db };
}

/**
 * Authenticates a cookie-session request for the lock endpoints: a verified
 * user (401 otherwise), the Origin header matching the host (403), and a
 * current `user_profiles` role of `master`/`admin` (401). Only after all of
 * that does it build the service-role client used for the lock table.
 */
export async function requireWebLockSession(
  req: Request,
): Promise<WebLockSession> {
  const user = await getUser();
  if (!user) {
    throw unauthorized();
  }

  try {
    assertSameOrigin(req);
  } catch (error) {
    if (error instanceof ApiError) {
      throw new WebResponseError(
        NextResponse.json({ error: error.message }, { status: error.status }),
      );
    }
    throw error;
  }

  return requireAdminProfile(user);
}

/** Maps thrown errors from a web lock route to a Response. */
export function webErrorResponse(context: string, error: unknown): NextResponse {
  if (error instanceof WebResponseError) {
    return error.response;
  }
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`Failed to ${context}:`, error);
  return NextResponse.json(
    { error: `Failed to ${context}` },
    { status: 500 },
  );
}
