import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors';
import { makeDb } from './fakeDb';
import {
  AGENT_LOCK_TTL_SECONDS,
  MAX_LOCK_TTL_SECONDS,
  MIN_LOCK_TTL_SECONDS,
  USER_LOCK_TTL_SECONDS,
  acquireLock,
  assertNoForeignLock,
  getLock,
  holderLabel,
  isLockingUnavailableError,
  releaseLock,
  toPublicLock,
  type AcquireLockOptions,
  type EditLock,
} from '../lockService';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const ACQUIRED_AT = '2026-10-12T10:02:00.000Z';
const EXPIRES_AT = '2026-10-12T10:04:00.000Z';
const USER_LABEL = 'alice@example.com';
const AGENT_LABEL = 'agent "weekly-writer" (alice@example.com)';

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    post_id: 'post-1',
    session_id: SESSION_ID,
    holder_kind: 'user',
    holder_user_id: 'user-1',
    holder_token_id: null,
    holder_label: USER_LABEL,
    acquired_at: ACQUIRED_AT,
    expires_at: EXPIRES_AT,
    ...overrides,
  };
}

function editLock(overrides: Partial<EditLock> = {}): EditLock {
  return {
    session_id: SESSION_ID,
    holder: { kind: 'user', label: USER_LABEL, user_id: 'user-1' },
    acquired_at: ACQUIRED_AT,
    expires_at: EXPIRES_AT,
    ...overrides,
  };
}

const baseOptions: AcquireLockOptions = {
  postId: 'post-1',
  holder: { kind: 'user', userId: 'user-1', label: USER_LABEL },
  ttlSeconds: USER_LOCK_TTL_SECONDS,
};

function expectApiError(error: unknown, code: string): ApiError {
  expect(error).toBeInstanceOf(ApiError);
  const apiError = error as ApiError;
  expect(apiError.code).toBe(code);
  return apiError;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TTL constants', () => {
  it('match the documented lease windows', () => {
    expect(USER_LOCK_TTL_SECONDS).toBe(120);
    expect(AGENT_LOCK_TTL_SECONDS).toBe(900);
    expect(MAX_LOCK_TTL_SECONDS).toBe(3600);
    expect(MIN_LOCK_TTL_SECONDS).toBe(60);
  });
});

describe('holderLabel', () => {
  it('labels users by email', () => {
    expect(holderLabel('user', USER_LABEL)).toBe(USER_LABEL);
  });

  it('labels agents with the token name and owner email', () => {
    expect(holderLabel('agent', USER_LABEL, 'weekly-writer')).toBe(AGENT_LABEL);
  });

  it('truncates to 200 characters', () => {
    const label = holderLabel('agent', USER_LABEL, 'x'.repeat(300));
    expect(label).toHaveLength(200);
  });
});

describe('isLockingUnavailableError', () => {
  it('recognises the missing-table/function codes', () => {
    for (const code of ['42P01', '42883', 'PGRST202', 'PGRST205']) {
      expect(isLockingUnavailableError({ code })).toBe(true);
    }
  });

  it('recognises missing-object messages that name the lock objects', () => {
    expect(
      isLockingUnavailableError({
        message: 'relation "public.post_edit_locks" does not exist',
      }),
    ).toBe(true);
    expect(
      isLockingUnavailableError({
        code: 'PGRST205',
        message:
          "Could not find the table 'public.post_edit_locks' in the schema cache",
      }),
    ).toBe(true);
    expect(
      isLockingUnavailableError({
        message:
          'Could not find the function public.acquire_post_edit_lock(...) in the schema cache',
      }),
    ).toBe(true);
  });

  it('does not treat unrelated errors as unavailable', () => {
    expect(isLockingUnavailableError(null)).toBe(false);
    expect(
      isLockingUnavailableError({ code: '23505', message: 'duplicate key' }),
    ).toBe(false);
    expect(
      isLockingUnavailableError({
        message: 'post_edit_locks operation failed',
      }),
    ).toBe(false);
  });
});

describe('acquireLock', () => {
  it('acquires a free lock and maps the returned row', async () => {
    const db = makeDb();
    db.enqueueRpc('acquire_post_edit_lock', {
      data: { acquired: true, lock: row() },
      error: null,
    });

    const result = await acquireLock(db.client, baseOptions);

    expect(result).toEqual({
      locking: 'enabled',
      acquired: true,
      lock: editLock(),
    });
    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0].fn).toBe('acquire_post_edit_lock');
    expect(db.rpcCalls[0].args).toMatchObject({
      p_post_id: 'post-1',
      p_holder_kind: 'user',
      p_holder_user_id: 'user-1',
      p_holder_token_id: null,
      p_holder_label: USER_LABEL,
      p_ttl_seconds: USER_LOCK_TTL_SECONDS,
      p_force: false,
    });
  });

  it('generates a session id when none is given', async () => {
    const db = makeDb();
    db.enqueueRpc('acquire_post_edit_lock', {
      data: { acquired: true, lock: row() },
      error: null,
    });

    await acquireLock(db.client, baseOptions);

    const session = db.rpcCalls[0].args.p_session_id;
    expect(typeof session).toBe('string');
    expect(session).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('renews with the caller-supplied session id', async () => {
    const db = makeDb();
    db.enqueueRpc('acquire_post_edit_lock', {
      data: { acquired: true, lock: row() },
      error: null,
    });

    await acquireLock(db.client, { ...baseOptions, sessionId: 'my-session' });

    expect(db.rpcCalls[0].args.p_session_id).toBe('my-session');
  });

  it('reports the other holder when the lock is taken', async () => {
    const db = makeDb();
    db.enqueueRpc('acquire_post_edit_lock', {
      data: {
        acquired: false,
        lock: row({
          holder_kind: 'agent',
          holder_user_id: 'user-2',
          holder_label: AGENT_LABEL,
        }),
      },
      error: null,
    });

    const result = await acquireLock(db.client, baseOptions);

    expect(result).toEqual({
      locking: 'enabled',
      acquired: false,
      lock: editLock({
        holder: { kind: 'agent', label: AGENT_LABEL, user_id: 'user-2' },
      }),
    });
  });

  it('passes force through to the RPC', async () => {
    const db = makeDb();
    db.enqueueRpc('acquire_post_edit_lock', {
      data: { acquired: true, lock: row() },
      error: null,
    });

    await acquireLock(db.client, { ...baseOptions, force: true });

    expect(db.rpcCalls[0].args.p_force).toBe(true);
  });

  it('rejects a ttl outside the allowed range before calling the RPC', async () => {
    for (const ttlSeconds of [MIN_LOCK_TTL_SECONDS - 1, MAX_LOCK_TTL_SECONDS + 1, 10.5, NaN]) {
      const db = makeDb();
      try {
        await acquireLock(db.client, { ...baseOptions, ttlSeconds });
        throw new Error('expected acquireLock to throw');
      } catch (error) {
        expectApiError(error, 'validation_failed');
      }
      expect(db.rpcCalls).toHaveLength(0);
    }
  });
});

describe('graceful degradation', () => {
  it('recognises every unavailable code and warns only once per process', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
    const lock = await import('../lockService');
    const db = makeDb();
    db.enqueueRpc(
      'acquire_post_edit_lock',
      { data: null, error: { code: 'PGRST202' } },
      { data: null, error: { code: 'PGRST202' } },
    );

    const first = await lock.acquireLock(db.client, baseOptions);
    const second = await lock.acquireLock(db.client, baseOptions);

    expect(first).toEqual({ locking: 'unavailable', acquired: false, lock: null });
    expect(second).toEqual({ locking: 'unavailable', acquired: false, lock: null });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each(['42P01', '42883', 'PGRST202', 'PGRST205'])(
    'treats %s as unavailable on acquire',
    async (code) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.resetModules();
      const lock = await import('../lockService');
      const db = makeDb();
      db.enqueueRpc('acquire_post_edit_lock', {
        data: null,
        error: { code },
      });

      expect(await lock.acquireLock(db.client, baseOptions)).toEqual({
        locking: 'unavailable',
        acquired: false,
        lock: null,
      });
    },
  );

  it('getLock returns null when locking is unavailable', async () => {
    const db = makeDb({
      post_edit_locks: [{ data: null, error: { code: '42P01' } }],
    });
    await expect(getLock(db.client, 'post-1')).resolves.toBeNull();
  });

  it('releaseLock returns false when locking is unavailable', async () => {
    const db = makeDb({
      post_edit_locks: [{ data: null, error: { code: '42P01' } }],
    });
    await expect(releaseLock(db.client, 'post-1', SESSION_ID)).resolves.toBe(false);
  });

  it('assertNoForeignLock passes when locking is unavailable', async () => {
    const db = makeDb({
      post_edit_locks: [{ data: null, error: { code: 'PGRST205' } }],
    });
    await expect(
      assertNoForeignLock(db.client, 'post-1', SESSION_ID),
    ).resolves.toBeUndefined();
  });
});

describe('getLock', () => {
  it('returns null when there is no lock', async () => {
    const db = makeDb({ post_edit_locks: [{ data: null, error: null }] });
    await expect(getLock(db.client, 'post-1')).resolves.toBeNull();
  });

  it('maps a returned row', async () => {
    const db = makeDb({ post_edit_locks: [{ data: row(), error: null }] });
    await expect(getLock(db.client, 'post-1')).resolves.toEqual(editLock());
  });

  it('excludes expired leases in the query', async () => {
    const db = makeDb({ post_edit_locks: [{ data: null, error: null }] });
    await getLock(db.client, 'post-1', '2030-01-01T00:00:00.000Z');

    expect(db.callsFor('post_edit_locks', 'eq')[0].args).toEqual([
      'post_id',
      'post-1',
    ]);
    expect(db.callsFor('post_edit_locks', 'gt')[0].args).toEqual([
      'expires_at',
      '2030-01-01T00:00:00.000Z',
    ]);
  });
});

describe('releaseLock', () => {
  it('returns true when a row was deleted', async () => {
    const db = makeDb({ post_edit_locks: [{ data: [row()], error: null }] });
    await expect(
      releaseLock(db.client, 'post-1', SESSION_ID),
    ).resolves.toBe(true);

    expect(db.callsFor('post_edit_locks', 'delete')).toHaveLength(1);
    expect(db.callsFor('post_edit_locks', 'eq')).toEqual([
      { table: 'post_edit_locks', method: 'eq', args: ['post_id', 'post-1'] },
      {
        table: 'post_edit_locks',
        method: 'eq',
        args: ['session_id', SESSION_ID],
      },
    ]);
  });

  it('returns false when nothing matched', async () => {
    const db = makeDb({ post_edit_locks: [{ data: [], error: null }] });
    await expect(
      releaseLock(db.client, 'post-1', SESSION_ID),
    ).resolves.toBe(false);
  });
});

describe('assertNoForeignLock', () => {
  it('passes when there is no lock', async () => {
    const db = makeDb({ post_edit_locks: [{ data: null, error: null }] });
    await expect(
      assertNoForeignLock(db.client, 'post-1', undefined),
    ).resolves.toBeUndefined();
  });

  it('passes when the caller owns the lock', async () => {
    const db = makeDb({ post_edit_locks: [{ data: row(), error: null }] });
    await expect(
      assertNoForeignLock(db.client, 'post-1', SESSION_ID),
    ).resolves.toBeUndefined();
  });

  it('passes when the session and caller user both match the holder', async () => {
    const db = makeDb({ post_edit_locks: [{ data: row(), error: null }] });
    await expect(
      assertNoForeignLock(db.client, 'post-1', SESSION_ID, 'user-1'),
    ).resolves.toBeUndefined();
  });

  it('treats a matching session id from a different user as foreign', async () => {
    const db = makeDb({ post_edit_locks: [{ data: row(), error: null }] });
    await expect(
      assertNoForeignLock(db.client, 'post-1', SESSION_ID, 'user-2'),
    ).rejects.toMatchObject({ code: 'locked' });
  });

  it('throws locked for a user holder when no session id is given', async () => {
    const db = makeDb({ post_edit_locks: [{ data: row(), error: null }] });
    try {
      await assertNoForeignLock(db.client, 'post-1', undefined);
      throw new Error('expected assertNoForeignLock to throw');
    } catch (error) {
      const apiError = expectApiError(error, 'locked');
      expect(apiError.status).toBe(409);
      expect(apiError.message).toBe(
        'Admin alice@example.com is editing this post (since 10:02 UTC; lock expires 10:04 UTC)',
      );
      expect(apiError.details).toEqual({
        holder: { kind: 'user', label: USER_LABEL, user_id: 'user-1' },
        acquired_at: ACQUIRED_AT,
        expires_at: EXPIRES_AT,
        taken_over: false,
      });
      expect(JSON.stringify(apiError.details)).not.toContain(SESSION_ID);
    }
  });

  it('throws locked with an agent holder for a different session', async () => {
    const db = makeDb({
      post_edit_locks: [
        {
          data: row({
            holder_kind: 'agent',
            holder_user_id: 'user-2',
            holder_label: AGENT_LABEL,
          }),
          error: null,
        },
      ],
    });
    try {
      await assertNoForeignLock(db.client, 'post-1', undefined);
      throw new Error('expected assertNoForeignLock to throw');
    } catch (error) {
      const apiError = expectApiError(error, 'locked');
      expect(apiError.message).toBe(
        `${AGENT_LABEL[0].toUpperCase()}${AGENT_LABEL.slice(1)} is editing this post (since 10:02 UTC; lock expires 10:04 UTC)`,
      );
      expect(apiError.details).toMatchObject({
        holder: { kind: 'agent', label: AGENT_LABEL, user_id: 'user-2' },
        taken_over: false,
      });
    }
  });

  it('reports a takeover when the caller had a session and lost it', async () => {
    const db = makeDb({ post_edit_locks: [{ data: row(), error: null }] });
    try {
      await assertNoForeignLock(db.client, 'post-1', 'my-old-session');
      throw new Error('expected assertNoForeignLock to throw');
    } catch (error) {
      const apiError = expectApiError(error, 'locked');
      expect(apiError.message).toBe(
        'Your edit session was taken over by admin alice@example.com at 10:02 UTC',
      );
      expect(apiError.details).toMatchObject({ taken_over: true });
    }
  });
});

describe('toPublicLock', () => {
  it('hides session_id from other viewers', () => {
    const pub = toPublicLock(editLock(), 'someone-else');
    expect(pub).not.toBeNull();
    expect(pub).not.toHaveProperty('session_id');
    expect(pub?.holder).toEqual(editLock().holder);
  });

  it('keeps session_id for the owning session', () => {
    expect(toPublicLock(editLock(), SESSION_ID)).toEqual(editLock());
  });

  it('passes null through', () => {
    expect(toPublicLock(null, SESSION_ID)).toBeNull();
  });
});
