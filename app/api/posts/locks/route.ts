import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { isLockingUnavailableError } from '@/lib/cms/lockService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface ActiveLockSummary {
  kind: 'user' | 'agent';
  label: string;
  expires_at: string;
}

/**
 * Lightweight active-lock map for the admin posts list. Returns
 * `{ locking: 'unavailable', locks: {} }` when the migration isn't applied so
 * the list simply skips the badges.
 */
export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient();
  const { data: profile, error: profileError } = await db
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile as { role?: unknown } | null)?.role;
  if (profileError || (role !== 'master' && role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await db
    .from('post_edit_locks')
    .select('post_id, holder_kind, holder_label, expires_at')
    .gt('expires_at', new Date().toISOString());

  if (error) {
    if (isLockingUnavailableError(error)) {
      return NextResponse.json({ locking: 'unavailable', locks: {} });
    }
    console.error('Failed to list edit locks:', error);
    return NextResponse.json(
      { error: 'Failed to list edit locks' },
      { status: 500 },
    );
  }

  const locks: Record<string, ActiveLockSummary> = {};
  for (const row of (data ?? []) as Array<{
    post_id: string;
    holder_kind: string;
    holder_label: string;
    expires_at: string;
  }>) {
    locks[row.post_id] = {
      kind: row.holder_kind === 'agent' ? 'agent' : 'user',
      label: row.holder_label,
      expires_at: row.expires_at,
    };
  }

  return NextResponse.json({ locking: 'enabled', locks });
}
