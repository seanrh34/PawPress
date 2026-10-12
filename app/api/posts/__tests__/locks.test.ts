import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/lib/cms/errors';
import { makeRouteDb, type RouteDb } from '@/app/api/v1/__tests__/fakeRouteDb';

const state = vi.hoisted(() => ({
  user: null as unknown,
  client: undefined as unknown,
  anon: undefined as unknown,
}));

vi.mock('@/lib/auth', () => ({
  getUser: async () => state.user,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => state.client,
}));

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return state.anon;
  },
}));

vi.mock('@/lib/supabase-server', () => ({
  getAuthenticatedSupabaseClient: async () => state.client,
}));

vi.mock('@/lib/uploadImages', () => ({
  processAndUploadImages: async (value: unknown) => value,
}));

import { POST as lockPost } from '@/app/api/posts/[id]/lock/route';
import { POST as releasePost } from '@/app/api/posts/[id]/lock/release/route';
import {
  DELETE as postDelete,
  PUT as postPut,
} from '@/app/api/posts/[id]/route';

const USER_ID = 'user-1';
const USER_EMAIL = 'alice@example.com';
const UUID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const SESSION = '33333333-3333-4333-8333-333333333333';
const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-01T00:00:01.000Z';

let db: RouteDb;

function postRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    ...overrides,
  };
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

function jsonRequest(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: 'http://test.local',
      host: 'test.local',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: UUID }) };

beforeEach(() => {
  db = makeRouteDb();
  state.user = { id: USER_ID, email: USER_EMAIL };
  state.client = db.client;
  state.anon = db.client;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('web POST /api/posts/:id/lock', () => {
  it('returns 401 without a session', async () => {
    state.user = null;
    const response = await lockPost(
      new NextRequest('http://test.local/api/posts/x/lock', { method: 'POST' }),
      ctx,
    );
    expect(response.status).toBe(401);
  });

  it('rejects a cross-origin request with 403 before touching the database', async () => {
    const request = new NextRequest('http://test.local/api/posts/x/lock', {
      method: 'POST',
      headers: { origin: 'http://evil.test', host: 'test.local' },
    });
    const response = await lockPost(request, ctx);
    expect(response.status).toBe(403);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('acquires a lock for the session user', async () => {
    db.enqueue('posts', { data: postRow() });
    db.enqueueRpc('acquire_post_edit_lock', {
      data: { acquired: true, lock: lockRow() },
      error: null,
    });

    const response = await lockPost(
      jsonRequest(`http://test.local/api/posts/${UUID}/lock`, 'POST', {}),
      ctx,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ locking: 'enabled', acquired: true });
    expect(body.lock.session_id).toBe(SESSION);
    expect(db.rpcCalls[0].args).toMatchObject({
      p_holder_kind: 'user',
      p_holder_label: USER_EMAIL,
      p_force: false,
    });
  });

  it('allows a human to force a takeover', async () => {
    db.enqueue('posts', { data: postRow() });
    db.enqueueRpc('acquire_post_edit_lock', {
      data: { acquired: true, lock: lockRow() },
      error: null,
    });

    const response = await lockPost(
      jsonRequest(`http://test.local/api/posts/${UUID}/lock`, 'POST', { force: true }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(db.rpcCalls[0].args.p_force).toBe(true);
  });

  it('reports the other holder when the lock is taken', async () => {
    db.enqueue('posts', { data: postRow() });
    db.enqueueRpc('acquire_post_edit_lock', {
      data: {
        acquired: false,
        lock: lockRow({
          holder_kind: 'agent',
          holder_user_id: 'user-2',
          holder_label: 'agent "weekly-writer" (bob@example.com)',
        }),
      },
      error: null,
    });

    const response = await lockPost(
      jsonRequest(`http://test.local/api/posts/${UUID}/lock`, 'POST', {}),
      ctx,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.acquired).toBe(false);
    expect(body.lock.holder.kind).toBe('agent');
    expect(body.lock).not.toHaveProperty('session_id');
  });
});

describe('web POST /api/posts/:id/lock/release', () => {
  it('accepts a text/plain sendBeacon body', async () => {
    db.enqueue('post_edit_locks', { data: [lockRow()], error: null });

    const request = new NextRequest(
      `http://test.local/api/posts/${UUID}/lock/release`,
      {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          origin: 'http://test.local',
          host: 'test.local',
        },
        body: JSON.stringify({ session_id: SESSION }),
      },
    );

    const response = await releasePost(request, ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ released: true });
  });
});

describe('web PUT /api/posts/:id with locks', () => {
  it('still works without lock_session_id or if_updated_at', async () => {
    db.enqueue(
      'posts',
      { data: postRow() },
      { data: postRow() },
      { data: { ...postRow(), title: 'New' } },
      { data: postRow({ title: 'New' }) },
    );
    const response = await postPut(
      jsonRequest(`http://test.local/api/posts/${UUID}`, 'PUT', { title: 'New' }),
      ctx,
    );
    expect(response.status).toBe(200);
  });

  it('returns 409 locked when another session holds an unexpired lock', async () => {
    db.enqueueRpc('get_post_edit_lock', { data: lockRow(), error: null });
    const response = await postPut(
      jsonRequest(`http://test.local/api/posts/${UUID}`, 'PUT', {
        title: 'New',
        lock_session_id: '55555555-5555-4555-8555-555555555555',
      }),
      ctx,
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('locked');
    expect(body.error).toContain(USER_EMAIL);
    expect(body.holder).toMatchObject({ kind: 'user' });
    expect(db.callsFor('posts', 'update')).toHaveLength(0);
  });

  it('returns 409 conflict when if_updated_at is stale', async () => {
    db.enqueue('posts', { data: postRow({ updated_at: T1 }) });
    const response = await postPut(
      jsonRequest(`http://test.local/api/posts/${UUID}`, 'PUT', {
        title: 'New',
        if_updated_at: T0,
      }),
      ctx,
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('conflict');
    expect(body.error).toBe('This post was changed since you opened it.');
    expect(body.current_updated_at).toBe(T1);
  });

  it('rejects a malformed lock_session_id', async () => {
    const response = await postPut(
      jsonRequest(`http://test.local/api/posts/${UUID}`, 'PUT', {
        title: 'New',
        lock_session_id: 'nope',
      }),
      ctx,
    );
    expect(response.status).toBe(400);
  });
});

describe('web DELETE /api/posts/:id with an agent lock', () => {
  it('refuses while an agent holds the lock', async () => {
    db.enqueueRpc('get_post_edit_lock', {
      data: lockRow({ holder_kind: 'agent', holder_user_id: 'user-2', holder_label: 'agent "x" (bob@example.com)' }),
      error: null,
    });
    const response = await postDelete(
      new NextRequest(`http://test.local/api/posts/${UUID}`, {
        method: 'DELETE',
        headers: { origin: 'http://test.local', host: 'test.local' },
      }),
      ctx,
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('locked');
    expect(body.holder.kind).toBe('agent');
    expect(db.callsFor('posts', 'delete')).toHaveLength(0);
  });

  it('deletes with force=1', async () => {
    db.enqueueRpc('get_post_edit_lock', {
      data: lockRow({ holder_kind: 'agent', holder_user_id: 'user-2', holder_label: 'agent "x" (bob@example.com)' }),
      error: null,
    });
    db.enqueue('posts', { data: postRow() }, { data: null, error: null });
    const response = await postDelete(
      new NextRequest(`http://test.local/api/posts/${UUID}?force=1`, {
        method: 'DELETE',
        headers: { origin: 'http://test.local', host: 'test.local' },
      }),
      ctx,
    );
    expect(response.status).toBe(200);
  });
});

describe('web write routes require an admin profile and a UUID', () => {
  it('rejects a non-admin profile on PUT with the legacy 401 shape', async () => {
    db.role = 'user';
    const response = await postPut(
      jsonRequest(`http://test.local/api/posts/${UUID}`, 'PUT', { title: 'New' }),
      ctx,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(db.callsFor('posts', 'update')).toHaveLength(0);
  });

  it('rejects a non-admin profile on DELETE with the legacy 401 shape', async () => {
    db.hasProfile = false;
    const response = await postDelete(
      new NextRequest(`http://test.local/api/posts/${UUID}`, {
        method: 'DELETE',
        headers: { origin: 'http://test.local', host: 'test.local' },
      }),
      ctx,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(db.callsFor('posts', 'delete')).toHaveLength(0);
  });

  it('returns 404 for a non-UUID id before any database call', async () => {
    const nonUuid = 'not-a-uuid';
    const put = await postPut(
      jsonRequest('http://test.local/api/posts/not-a-uuid', 'PUT', { title: 'x' }),
      { params: Promise.resolve({ id: nonUuid }) },
    );
    expect(put.status).toBe(404);

    const del = await postDelete(
      new NextRequest('http://test.local/api/posts/not-a-uuid', {
        method: 'DELETE',
        headers: { origin: 'http://test.local', host: 'test.local' },
      }),
      { params: Promise.resolve({ id: nonUuid }) },
    );
    expect(del.status).toBe(404);

    expect(db.callsFor('posts', 'update')).toHaveLength(0);
    expect(db.callsFor('posts', 'delete')).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
  });
});

describe('ApiError import sanity', () => {
  it('exposes the locked code', () => {
    expect(ApiError.locked('x').code).toBe('locked');
  });
});
