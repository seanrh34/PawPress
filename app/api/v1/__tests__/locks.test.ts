import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mintToken } from '@/lib/auth/tokens';
import type { TokenMeta } from '@/lib/auth/tokenStore';
import type { Scope } from '@/lib/cms/permissions';
import type { PostRow } from '@/lib/cms/postService';
import { makeRouteDb, type RouteDb } from './fakeRouteDb';

const adminHolder = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => adminHolder.client,
}));

import { POST as lockPost, DELETE as lockDelete } from '@/app/api/v1/posts/[id]/lock/route';
import {
  DELETE as postDelete,
  GET as postGet,
  PATCH as postPatch,
} from '@/app/api/v1/posts/[id]/route';
import { POST as publishPostRoute } from '@/app/api/v1/posts/[id]/publish/route';
import { POST as unpublishPostRoute } from '@/app/api/v1/posts/[id]/unpublish/route';

const SECRET = 'pawpress-test-secret-0123456789abcdef';
const USER_ID = 'user-1';
const USER_EMAIL = 'alice@example.com';
const UUID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const SESSION = '33333333-3333-4333-8333-333333333333';
const OTHER_SESSION = '44444444-4444-4444-8444-444444444444';
const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-01T00:00:01.000Z';
const BASE = 'http://test.local/api/v1';

let db: RouteDb;

function postRow(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: UUID,
    title: 'Hello',
    slug: 'hello',
    content_lexical: null,
    content_html: '',
    excerpt: '',
    featured_image_url: null,
    published_at: null,
    created_at: T0,
    updated_at: T0,
    category_id: CATEGORY_ID,
    category: { id: CATEGORY_ID, slug: 'news', name: 'News' },
    ...overrides,
  };
}

function barePostRow(overrides: Partial<PostRow> = {}): PostRow {
  const copy: Partial<PostRow> = { ...postRow(overrides) };
  delete copy.category;
  return copy as PostRow;
}

function lockRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    post_id: UUID,
    session_id: SESSION,
    holder_kind: 'user',
    holder_user_id: USER_ID,
    holder_token_id: null,
    holder_label: USER_EMAIL,
    acquired_at: T0,
    expires_at: '2999-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function acquired(lock: Record<string, unknown> = lockRow()) {
  return { data: { acquired: true, lock }, error: null };
}

function notAcquired(lock: Record<string, unknown> = lockRow()) {
  return { data: { acquired: false, lock }, error: null };
}

async function issueToken(scopes: Scope[], name = 'weekly-writer'): Promise<string> {
  const id = randomUUID();
  const meta: TokenMeta = {
    id,
    name,
    scopes: [...scopes],
    created_at: T0,
    expires_at: '2999-01-01T00:00:00.000Z',
  };
  const user = db.users.get(USER_ID);
  if (!user) throw new Error('test user missing');
  const tokens = (user.app_metadata.pawpress_tokens as TokenMeta[]) ?? [];
  user.app_metadata.pawpress_tokens = [...tokens, meta];
  return mintToken({
    userId: USER_ID,
    tokenId: id,
    scopes,
    expiresAt: new Date('2999-01-01T00:00:00.000Z'),
  });
}

function withToken(
  url: string,
  method: string,
  token: string | null,
  options: { body?: unknown; lockSession?: string } = {},
): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.lockSession) headers['x-pawpress-lock-session'] = options.lockSession;
  return new Request(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv('PAWPRESS_TOKEN_SECRET', SECRET);
  db = makeRouteDb();
  db.users.set(USER_ID, {
    id: USER_ID,
    email: USER_EMAIL,
    app_metadata: { pawpress_tokens: [] },
  });
  adminHolder.client = db.client;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /posts/:id/lock', () => {
  it('returns 401 without a token', async () => {
    const response = await lockPost(
      withToken(`${BASE}/posts/${UUID}/lock`, 'POST', null, { body: {} }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('unauthorized');
  });

  it('returns 404 without touching the database for a non-UUID id', async () => {
    const token = await issueToken(['posts:write']);
    const response = await lockPost(
      withToken(`${BASE}/posts/nope/lock`, 'POST', token, { body: {} }),
      ctxFor('nope'),
    );
    expect(response.status).toBe(404);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('returns 404 when the post is missing', async () => {
    const token = await issueToken(['posts:write']);
    db.enqueue('posts', { data: null });
    const response = await lockPost(
      withToken(`${BASE}/posts/${UUID}/lock`, 'POST', token, { body: {} }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(404);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('refuses a draft-only token on a scheduled post', async () => {
    const token = await issueToken(['posts:write']);
    db.enqueue('posts', { data: postRow({ published_at: '2999-01-01T00:00:00.000Z' }) });
    const response = await lockPost(
      withToken(`${BASE}/posts/${UUID}/lock`, 'POST', token, { body: {} }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(403);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('acquires a free lock as an agent holder labelled with token and owner', async () => {
    const infos: string[] = [];
    vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
      infos.push(args.map((arg) => String(arg)).join(' '));
    });
    const token = await issueToken(['posts:write']);
    db.enqueue('posts', { data: postRow() });
    db.enqueueRpc(
      'acquire_post_edit_lock',
      acquired(
        lockRow({
          holder_kind: 'agent',
          holder_token_id: 'token-1',
          holder_label: `agent "weekly-writer" (${USER_EMAIL})`,
        }),
      ),
    );

    const response = await lockPost(
      withToken(`${BASE}/posts/${UUID}/lock`, 'POST', token, { body: {} }),
      ctxFor(UUID),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.locking).toBe('enabled');
    expect(body.lock.session_id).toBe(SESSION);
    expect(body.lock.holder).toMatchObject({
      kind: 'agent',
      label: `agent "weekly-writer" (${USER_EMAIL})`,
      user_id: USER_ID,
    });
    expect(db.rpcCalls[0].args).toMatchObject({
      p_holder_kind: 'agent',
      p_holder_label: `agent "weekly-writer" (${USER_EMAIL})`,
      p_force: false,
    });
    const audit = infos.find((line) => line.includes('pawpress.audit'));
    expect(JSON.parse(audit as string)).toMatchObject({ action: 'post.lock' });
  });

  it('renews with the caller-supplied session and ttl', async () => {
    const token = await issueToken(['posts:write']);
    db.enqueue('posts', { data: postRow() });
    db.enqueueRpc(
      'acquire_post_edit_lock',
      acquired(lockRow({ holder_kind: 'agent', holder_label: `agent "weekly-writer" (${USER_EMAIL})` })),
    );

    const response = await lockPost(
      withToken(`${BASE}/posts/${UUID}/lock`, 'POST', token, {
        body: { session_id: SESSION, ttl_seconds: 1200 },
      }),
      ctxFor(UUID),
    );

    expect(response.status).toBe(200);
    expect(db.rpcCalls[0].args).toMatchObject({
      p_session_id: SESSION,
      p_ttl_seconds: 1200,
    });
  });

  it('reports 409 with the holder when a human holds the lock', async () => {
    const token = await issueToken(['posts:write']);
    db.enqueue('posts', { data: postRow() });
    db.enqueueRpc('acquire_post_edit_lock', notAcquired());

    const response = await lockPost(
      withToken(`${BASE}/posts/${UUID}/lock`, 'POST', token, { body: {} }),
      ctxFor(UUID),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('locked');
    expect(body.error.message).toContain(USER_EMAIL);
    expect(body.error.details.holder).toMatchObject({ kind: 'user', label: USER_EMAIL });
    expect(JSON.stringify(body)).not.toContain(SESSION);
  });

  it('reports 409 with an agent holder', async () => {
    const token = await issueToken(['posts:write']);
    const label = 'agent "other" (bob@example.com)';
    db.enqueue('posts', { data: postRow() });
    db.enqueueRpc(
      'acquire_post_edit_lock',
      notAcquired(lockRow({ holder_kind: 'agent', holder_user_id: 'user-2', holder_label: label })),
    );

    const response = await lockPost(
      withToken(`${BASE}/posts/${UUID}/lock`, 'POST', token, { body: {} }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.details.holder).toMatchObject({ kind: 'agent', label });
    expect(body.error.details.taken_over).toBe(false);
  });

  it('never honours force for a token', async () => {
    const token = await issueToken(['posts:write']);
    db.enqueue('posts', { data: postRow() });
    const response = await lockPost(
      withToken(`${BASE}/posts/${UUID}/lock`, 'POST', token, { body: { force: true } }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('validation_failed');
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('rejects an invalid session_id and ttl before the database', async () => {
    const token = await issueToken(['posts:write']);
    const badSession = await lockPost(
      withToken(`${BASE}/posts/${UUID}/lock`, 'POST', token, {
        body: { session_id: 'not-a-uuid' },
      }),
      ctxFor(UUID),
    );
    expect(badSession.status).toBe(400);

    const badTtl = await lockPost(
      withToken(`${BASE}/posts/${UUID}/lock`, 'POST', token, {
        body: { ttl_seconds: 5 },
      }),
      ctxFor(UUID),
    );
    expect(badTtl.status).toBe(400);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('degrades gracefully when locking is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = await issueToken(['posts:write']);
    db.enqueue('posts', { data: postRow() });
    db.enqueueRpc('acquire_post_edit_lock', { data: null, error: { code: 'PGRST202' } });

    const response = await lockPost(
      withToken(`${BASE}/posts/${UUID}/lock`, 'POST', token, { body: {} }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ locking: 'unavailable', lock: null });
  });
});

describe('DELETE /posts/:id/lock', () => {
  it('requires the session header', async () => {
    const token = await issueToken(['posts:write']);
    const response = await lockDelete(
      withToken(`${BASE}/posts/${UUID}/lock`, 'DELETE', token),
      ctxFor(UUID),
    );
    expect(response.status).toBe(400);
  });

  it('rejects a non-UUID session header', async () => {
    const token = await issueToken(['posts:write']);
    const response = await lockDelete(
      withToken(`${BASE}/posts/${UUID}/lock`, 'DELETE', token, { lockSession: 'nope' }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(400);
  });

  it('releases the caller session and audits the unlock', async () => {
    const infos: string[] = [];
    vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
      infos.push(args.map((arg) => String(arg)).join(' '));
    });
    const token = await issueToken(['posts:write']);
    db.enqueue('post_edit_locks', { data: [lockRow()], error: null });

    const response = await lockDelete(
      withToken(`${BASE}/posts/${UUID}/lock`, 'DELETE', token, { lockSession: SESSION }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ released: true });
    const audit = infos.find((line) => line.includes('pawpress.audit'));
    expect(JSON.parse(audit as string)).toMatchObject({ action: 'post.unlock' });
  });
});

describe('GET /posts/:id edit_lock', () => {
  it('exposes the lock without the session id to other viewers', async () => {
    const token = await issueToken(['posts:read']);
    db.enqueue('posts', { data: postRow() });
    db.enqueue('post_edit_locks', { data: lockRow(), error: null });

    const response = await postGet(withToken(`${BASE}/posts/${UUID}`, 'GET', token), ctxFor(UUID));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.locking).toBe('enabled');
    expect(body.edit_lock).toMatchObject({ holder: { kind: 'user', label: USER_EMAIL } });
    expect(body.edit_lock).not.toHaveProperty('session_id');
  });

  it('keeps the session id for the owning session', async () => {
    const token = await issueToken(['posts:read']);
    db.enqueue('posts', { data: postRow() });
    db.enqueue('post_edit_locks', { data: lockRow(), error: null });

    const response = await postGet(
      withToken(`${BASE}/posts/${UUID}`, 'GET', token, { lockSession: SESSION }),
      ctxFor(UUID),
    );
    const body = await response.json();
    expect(body.edit_lock.session_id).toBe(SESSION);
  });

  it('reports locking unavailable when the table is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = await issueToken(['posts:read']);
    db.enqueue('posts', { data: postRow() });
    db.enqueue('post_edit_locks', { data: null, error: { code: '42P01' } });

    const response = await postGet(withToken(`${BASE}/posts/${UUID}`, 'GET', token), ctxFor(UUID));
    const body = await response.json();
    expect(body.locking).toBe('unavailable');
    expect(body.edit_lock).toBeNull();
  });
});

describe('token mutations respect edit locks', () => {
  async function writeToken(): Promise<string> {
    return issueToken(['posts:write', 'posts:publish']);
  }

  it('blocks PATCH while a human holds the lock', async () => {
    const token = await writeToken();
    db.enqueue('posts', { data: postRow() });
    db.enqueue('post_edit_locks', { data: lockRow(), error: null });

    const response = await postPatch(
      withToken(`${BASE}/posts/${UUID}`, 'PATCH', token, { body: { title: 'New' } }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('locked');
    expect(db.callsFor('posts', 'update')).toHaveLength(0);
  });

  it('allows PATCH with the matching session and user', async () => {
    const token = await writeToken();
    db.enqueue('posts', { data: postRow() }, { data: postRow() });
    db.enqueue('post_edit_locks', { data: lockRow(), error: null });
    db.enqueue('posts', { data: barePostRow({ title: 'New' }) }, { data: postRow({ title: 'New' }) });

    const response = await postPatch(
      withToken(`${BASE}/posts/${UUID}`, 'PATCH', token, {
        body: { title: 'New' },
        lockSession: SESSION,
      }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(200);
  });

  it('reports taken_over when the session was replaced by an admin', async () => {
    const token = await writeToken();
    db.enqueue('posts', { data: postRow() });
    db.enqueue('post_edit_locks', { data: lockRow({ session_id: SESSION }), error: null });

    const response = await postPatch(
      withToken(`${BASE}/posts/${UUID}`, 'PATCH', token, {
        body: { title: 'New' },
        lockSession: OTHER_SESSION,
      }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('locked');
    expect(body.error.details.taken_over).toBe(true);
    expect(body.error.message).toContain('taken over');
  });

  it('blocks publish, unpublish and delete while a lock is held', async () => {
    const token = await writeToken();
    db.enqueue('post_edit_locks', { data: lockRow(), error: null });
    const publish = await publishPostRoute(
      withToken(`${BASE}/posts/${UUID}/publish`, 'POST', token),
      ctxFor(UUID),
    );
    expect(publish.status).toBe(409);

    db.enqueue('post_edit_locks', { data: lockRow(), error: null });
    const unpublish = await unpublishPostRoute(
      withToken(`${BASE}/posts/${UUID}/unpublish`, 'POST', token),
      ctxFor(UUID),
    );
    expect(unpublish.status).toBe(409);

    const deleteToken = await issueToken(['posts:delete']);
    db.enqueue('post_edit_locks', { data: lockRow(), error: null });
    const deleted = await postDelete(
      withToken(`${BASE}/posts/${UUID}`, 'DELETE', deleteToken),
      ctxFor(UUID),
    );
    expect(deleted.status).toBe(409);
    expect(db.callsFor('posts', 'delete')).toHaveLength(0);
  });

  it('allows a mutation when locking is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = await writeToken();
    db.enqueue('posts', { data: postRow() }, { data: barePostRow({ published_at: T1 }) });
    db.enqueue('post_edit_locks', { data: null, error: { code: 'PGRST205' } });
    db.enqueue('posts', { data: postRow({ published_at: T1 }) });

    const response = await publishPostRoute(
      withToken(`${BASE}/posts/${UUID}/publish`, 'POST', token),
      ctxFor(UUID),
    );
    expect(response.status).toBe(200);
  });

  it('rejects an invalid lock-session header instead of ignoring it', async () => {
    const token = await writeToken();
    db.enqueue('posts', { data: postRow() });
    const response = await postPatch(
      withToken(`${BASE}/posts/${UUID}`, 'PATCH', token, {
        body: { title: 'New' },
        lockSession: 'definitely-not-a-uuid',
      }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('validation_failed');
    expect(db.callsFor('posts', 'update')).toHaveLength(0);
  });
});
