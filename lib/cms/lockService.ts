import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './errors';

/**
 * Edit-lock (lease) service. A post has at most one lock at a time; the lock is
 * held by an editing session, either a human in the web editor or an agent
 * token. See docs/cli-api.md §9.
 *
 * All functions take the service-role Supabase client first. The backing table
 * and RPC live in supabase/migrations/…_post_edit_locks.sql; until that
 * migration is applied the service degrades gracefully ("locking:
 * unavailable").
 */

/** Web editor sessions must heartbeat; their lease is short. */
export const USER_LOCK_TTL_SECONDS = 120;
/** Default agent lease. */
export const AGENT_LOCK_TTL_SECONDS = 900;
export const MAX_LOCK_TTL_SECONDS = 3600;
export const MIN_LOCK_TTL_SECONDS = 60;

export type LockHolderKind = 'user' | 'agent';

export interface LockHolder {
  kind: LockHolderKind;
  label: string;
  user_id: string;
}

export interface EditLock {
  session_id: string;
  holder: LockHolder;
  acquired_at: string;
  expires_at: string;
}

/** A lock as exposed to a viewer; `session_id` only for the owning session. */
export type PublicEditLock = Omit<EditLock, 'session_id'> & {
  session_id?: string;
};

export type LockResult =
  | { locking: 'enabled'; acquired: boolean; lock: EditLock | null }
  | { locking: 'unavailable'; acquired: false; lock: null };

export interface AcquireLockHolder {
  kind: LockHolderKind;
  userId: string;
  tokenId?: string;
  label: string;
}

export interface AcquireLockOptions {
  postId: string;
  sessionId?: string;
  holder: AcquireLockHolder;
  ttlSeconds: number;
  force?: boolean;
}

export interface LockErrorDetails {
  holder: LockHolder;
  acquired_at: string;
  expires_at: string;
  taken_over: boolean;
}

/** Row shape returned by the `acquire_post_edit_lock` RPC / the table. */
interface LockRow {
  session_id: string;
  holder_kind: LockHolderKind;
  holder_user_id: string;
  holder_label: string;
  acquired_at: string;
  expires_at: string;
}

const HOLDER_LABEL_MAX = 200;

/**
 * Strips ASCII control characters (except tab and newline) from untrusted text
 * before it is shown to a human, so a crafted token name or email can't emit
 * terminal escape sequences.
 */
export function stripControlChars(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || (code >= 0x20 && code !== 0x7f)) {
      out += char;
    }
  }
  return out;
}

/**
 * Human-readable label for the lock holder. Users are labelled with their
 * email; agents with their token name plus the owner's email. Control
 * characters are stripped from both inputs.
 */
export function holderLabel(
  kind: LockHolderKind,
  email: string,
  tokenName?: string,
): string {
  const cleanEmail = stripControlChars(email);
  const cleanName = tokenName === undefined ? undefined : stripControlChars(tokenName);
  const label =
    kind === 'agent' && cleanName
      ? `agent "${cleanName}" (${cleanEmail})`
      : cleanEmail;
  return label.slice(0, HOLDER_LABEL_MAX);
}

function toEditLock(row: LockRow): EditLock {
  return {
    session_id: String(row.session_id),
    holder: {
      kind: row.holder_kind === 'agent' ? 'agent' : 'user',
      label: String(row.holder_label),
      user_id: String(row.holder_user_id),
    },
    acquired_at: String(row.acquired_at),
    expires_at: String(row.expires_at),
  };
}

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);
const MISSING_FUNCTION_CODES = new Set(['42883', 'PGRST202']);

function errorText(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return typeof error === 'string' ? error : '';
  }
  const e = error as { message?: unknown; details?: unknown; hint?: unknown };
  return [e.message, e.details, e.hint]
    .filter((part): part is string => typeof part === 'string')
    .join(' ');
}

/**
 * True only when an error means the lock table or RPC is not installed yet (the
 * migration has not been applied). Everything else — including any other error
 * code — is treated as a genuine failure so editing enforcement fails closed.
 */
export function isLockingUnavailableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') {
    return false;
  }

  const text = errorText(error);

  if (MISSING_TABLE_CODES.has(code)) {
    return text.includes('post_edit_locks');
  }

  if (MISSING_FUNCTION_CODES.has(code)) {
    return (
      text.includes('acquire_post_edit_lock') ||
      text.includes('get_post_edit_lock')
    );
  }

  return false;
}

let unavailableWarningLogged = false;

function warnLockingUnavailableOnce(): void {
  if (unavailableWarningLogged) {
    return;
  }
  unavailableWarningLogged = true;
  console.warn(
    'Edit locking is unavailable: apply the post_edit_locks migration (supabase/migrations/…_post_edit_locks.sql) to enable it.',
  );
}

function internalLockError(operation: string, error: unknown): ApiError {
  // Never log row bodies or lock payloads.
  const code =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown }).code
      : undefined;
  console.error(`Failed to ${operation}:`, { code });
  return ApiError.internal('Edit lock operation failed');
}

function assertValidTtl(ttlSeconds: number): void {
  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < MIN_LOCK_TTL_SECONDS ||
    ttlSeconds > MAX_LOCK_TTL_SECONDS
  ) {
    const message = `ttl_seconds must be between ${MIN_LOCK_TTL_SECONDS} and ${MAX_LOCK_TTL_SECONDS}`;
    throw ApiError.validation(message, { fields: { ttl_seconds: [message] } });
  }
}

/**
 * Atomically acquire, renew, or (with `force`) take over a post's edit lock.
 */
export async function acquireLock(
  db: SupabaseClient,
  options: AcquireLockOptions,
): Promise<LockResult> {
  const { postId, holder, ttlSeconds, force = false } = options;
  assertValidTtl(ttlSeconds);

  const sessionId = options.sessionId ?? crypto.randomUUID();

  const { data, error } = await db.rpc('acquire_post_edit_lock', {
    p_post_id: postId,
    p_session_id: sessionId,
    p_holder_kind: holder.kind,
    p_holder_user_id: holder.userId,
    p_holder_token_id: holder.tokenId ?? null,
    p_holder_label: holder.label,
    p_ttl_seconds: ttlSeconds,
    p_force: force,
  });

  if (error) {
    if (isLockingUnavailableError(error)) {
      warnLockingUnavailableOnce();
      return { locking: 'unavailable', acquired: false, lock: null };
    }
    throw internalLockError('acquire edit lock', error);
  }

  const payload = (data ?? {}) as {
    acquired?: unknown;
    reason?: unknown;
    limit?: unknown;
    lock?: unknown;
  };
  const acquired = payload.acquired === true;
  const lock =
    payload.lock && typeof payload.lock === 'object'
      ? toEditLock(payload.lock as LockRow)
      : null;

  // Agents are capped at a handful of concurrent locks; surface the cap as a
  // conflict (not a foreign-lock 409) so the caller knows to release some.
  if (!acquired && payload.reason === 'too_many_locks' && holder.kind === 'agent') {
    const limit = typeof payload.limit === 'number' ? payload.limit : 5;
    throw ApiError.conflict(
      `Too many active edit locks for this user (max ${limit}); release some with \`pawpress posts unlock\``,
      { reason: 'too_many_locks', limit },
    );
  }

  return { locking: 'enabled', acquired, lock };
}

/**
 * The post's current unexpired lock plus whether locking is installed. Unlike
 * `getLock`, this distinguishes "no lock" from "locking unavailable" for
 * readers that report the mode (e.g. `GET /posts/:idOrSlug`).
 */
export async function getLockState(
  db: SupabaseClient,
  postId: string,
): Promise<{ locking: 'enabled' | 'unavailable'; lock: EditLock | null }> {
  // Read through the RPC so the database clock decides whether the lease has
  // expired; app-server clock skew can't make a lock look alive or dead.
  const { data, error } = await db.rpc('get_post_edit_lock', {
    p_post_id: postId,
  });

  if (error) {
    if (isLockingUnavailableError(error)) {
      warnLockingUnavailableOnce();
      return { locking: 'unavailable', lock: null };
    }
    throw internalLockError('read edit lock', error);
  }

  return {
    locking: 'enabled',
    lock: data && typeof data === 'object' ? toEditLock(data as LockRow) : null,
  };
}

/**
 * The post's current unexpired lock, or null (also when locking is
 * unavailable).
 */
export async function getLock(
  db: SupabaseClient,
  postId: string,
): Promise<EditLock | null> {
  return (await getLockState(db, postId)).lock;
}

/**
 * Releases the caller's own session lock. Returns whether a row was deleted.
 */
export async function releaseLock(
  db: SupabaseClient,
  postId: string,
  sessionId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('post_edit_locks')
    .delete()
    .eq('post_id', postId)
    .eq('session_id', sessionId)
    .select();

  if (error) {
    if (isLockingUnavailableError(error)) {
      warnLockingUnavailableOnce();
      return false;
    }
    throw internalLockError('release edit lock', error);
  }

  return Array.isArray(data) && data.length > 0;
}

function formatUtcTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes} UTC`;
}

function lockMessage(lock: EditLock, takenOver: boolean): string {
  const { kind, label } = lock.holder;

  if (takenOver) {
    const who = kind === 'user' ? `admin ${label}` : label;
    return `Your edit session was taken over by ${who} at ${formatUtcTime(lock.acquired_at)}`;
  }

  const who = kind === 'user' ? `Admin ${label}` : label.replace(/^agent/, 'Agent');
  return `${who} is editing this post (since ${formatUtcTime(lock.acquired_at)}; lock expires ${formatUtcTime(lock.expires_at)})`;
}

/**
 * Builds the `409 locked` error for a lock held by another session. `sessionId`
 * omitted means "any lock blocks me"; when provided, losing a held lock is
 * reported as a takeover. Never includes the foreign session id.
 */
export function foreignLockError(
  lock: EditLock,
  sessionId?: string,
): ApiError {
  const takenOver = sessionId !== undefined;
  const details: LockErrorDetails = {
    holder: lock.holder,
    acquired_at: lock.acquired_at,
    expires_at: lock.expires_at,
    taken_over: takenOver,
  };

  return ApiError.locked(lockMessage(lock, takenOver), details);
}

/**
 * Throws `409 locked` when an unexpired lock is held by a different session.
 * `sessionId` omitted means "any lock blocks me"; when provided, the caller's
 * own session does not block, and losing a held lock is reported as a takeover.
 * `callerUserId`, when given, must also match the holder (like the SQL
 * function's renew rule), so a session id is never enough on its own.
 */
export async function assertNoForeignLock(
  db: SupabaseClient,
  postId: string,
  sessionId: string | undefined,
  callerUserId?: string,
): Promise<void> {
  const lock = await getLock(db, postId);
  if (!lock) {
    return;
  }

  if (
    sessionId !== undefined &&
    lock.session_id === sessionId &&
    (callerUserId === undefined || lock.holder.user_id === callerUserId)
  ) {
    return;
  }

  throw foreignLockError(lock, sessionId);
}

/**
 * Strips `session_id` unless the viewer is the session that holds the lock.
 */
export function toPublicLock(
  lock: EditLock | null,
  viewerSessionId?: string,
): PublicEditLock | null {
  if (!lock) {
    return null;
  }

  if (lock.session_id === viewerSessionId) {
    return { ...lock };
  }

  return {
    holder: lock.holder,
    acquired_at: lock.acquired_at,
    expires_at: lock.expires_at,
  };
}
