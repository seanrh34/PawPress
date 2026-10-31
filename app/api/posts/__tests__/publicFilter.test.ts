import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  user: null as unknown,
  anon: undefined as unknown,
  auth: undefined as unknown,
  admin: undefined as unknown,
}));

const UUID = '22222222-2222-4222-8222-222222222222';

const calls = vi.hoisted(() => ({
  all: [] as { table: string; method: string; args: unknown[] }[],
}));

vi.mock('@/lib/auth', () => ({
  getUser: async () => state.user,
}));

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return state.anon;
  },
}));

vi.mock('@/lib/supabase-server', () => ({
  getAuthenticatedSupabaseClient: async () => state.auth,
}));

vi.mock('@/lib/uploadImages', () => ({
  processAndUploadImages: async (value: unknown) => value,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => state.admin,
}));

vi.mock('@/lib/cms/postService', () => ({
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
}));

import { GET as postsGet, POST as postsPost } from '@/app/api/posts/route';
import { GET as postGet, PUT as postPut } from '@/app/api/posts/[id]/route';

interface FakeResult {
  data: unknown;
  error: unknown;
}

function makeClient(result: FakeResult): unknown {
  function chain(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of [
      'select',
      'eq',
      'not',
      'ilike',
      'gt',
      'gte',
      'lt',
      'lte',
      'order',
      'range',
      'limit',
    ]) {
      query[method] = (...args: unknown[]) => {
        calls.all.push({ table, method, args });
        return query;
      };
    }
    query.single = async () => {
      calls.all.push({ table, method: 'single', args: [] });
      return result;
    };
    query.maybeSingle = async () => {
      calls.all.push({ table, method: 'maybeSingle', args: [] });
      return result;
    };
    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected);
    return query;
  }
  return { from: (table: string) => chain(table) };
}

function lteArgs(): unknown[][] {
  return calls.all
    .filter((call) => call.table === 'posts' && call.method === 'lte')
    .map((call) => call.args);
}

beforeEach(() => {
  calls.all = [];
  state.user = null;
  state.anon = makeClient({ data: [{ id: UUID }], error: null });
  state.auth = makeClient({ data: [{ id: UUID }], error: null });
  state.admin = makeClient({ data: { role: 'admin' }, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/posts anonymous filtering', () => {
  it('filters published_at <= now for anonymous callers', async () => {
    const response = await postsGet();
    expect(response.status).toBe(200);
    const filters = lteArgs();
    expect(filters).toHaveLength(1);
    expect(filters[0][0]).toBe('published_at');
    expect(typeof filters[0][1]).toBe('string');
  });

  it('does not filter for authenticated admins', async () => {
    state.user = { id: 'u1', email: 'a@b.c' };
    const response = await postsGet();
    expect(response.status).toBe(200);
    expect(lteArgs()).toHaveLength(0);
  });
});

describe('GET /api/posts/:id anonymous filtering', () => {
  const ctx = { params: Promise.resolve({ id: UUID }) };

  it('filters published_at <= now and 404s a hidden post', async () => {
    state.anon = makeClient({ data: null, error: { message: 'no rows' } });
    const response = await postGet(
      new NextRequest(`http://test.local/api/posts/${UUID}`),
      ctx,
    );
    expect(response.status).toBe(404);
    const filters = lteArgs();
    expect(filters).toHaveLength(1);
    expect(filters[0][0]).toBe('published_at');
  });

  it('does not filter for authenticated admins', async () => {
    state.user = { id: 'u1', email: 'a@b.c' };
    state.auth = makeClient({ data: { id: UUID }, error: null });
    const response = await postGet(
      new NextRequest(`http://test.local/api/posts/${UUID}`),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(lteArgs()).toHaveLength(0);
  });

  it('returns 404 for a non-UUID id without querying the database', async () => {
    calls.all = [];
    const response = await postGet(
      new NextRequest('http://test.local/api/posts/not-a-uuid'),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(response.status).toBe(404);
    expect(lteArgs()).toHaveLength(0);
    expect(calls.all).toHaveLength(0);
  });
});

describe('legacy web routes published_at validation', () => {
  function jsonRequest(url: string, method: string, body: unknown): NextRequest {
    return new NextRequest(url, {
      method,
      headers: {
        'content-type': 'application/json',
        origin: 'http://test.local',
        host: 'test.local',
      },
      body: JSON.stringify(body),
    });
  }

  it('rejects an unparseable published_at on create', async () => {
    state.user = { id: 'u1', email: 'a@b.c' };
    const response = await postsPost(
      jsonRequest('http://test.local/api/posts', 'POST', {
        title: 'X',
        published_at: 'not-a-date',
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('published_at');
  });

  it('rejects an offset-less published_at on create', async () => {
    state.user = { id: 'u1', email: 'a@b.c' };
    const response = await postsPost(
      jsonRequest('http://test.local/api/posts', 'POST', {
        title: 'X',
        published_at: '2026-07-01T09:00:00',
      }),
    );
    expect(response.status).toBe(400);
  });

  it('rejects an unparseable published_at on update', async () => {
    state.user = { id: 'u1', email: 'a@b.c' };
    const response = await postPut(
      jsonRequest(`http://test.local/api/posts/${UUID}`, 'PUT', {
        published_at: 'not-a-date',
      }),
      { params: Promise.resolve({ id: UUID }) },
    );
    expect(response.status).toBe(400);
  });
});
