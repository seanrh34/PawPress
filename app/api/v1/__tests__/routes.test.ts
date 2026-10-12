import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_SCOPES, type Scope } from '@/lib/cms/permissions';
import { makeFakeAdmin, type FakeAdmin } from '@/lib/auth/__tests__/fakes';
import type { AuthContext } from '@/lib/auth/context';

const mocks = vi.hoisted(() => ({
  getTokenAuth: vi.fn(),
  getSessionAuth: vi.fn(),
  assertSameOrigin: vi.fn(),
}));

const adminHolder = vi.hoisted(() => ({
  client: undefined as unknown,
}));

vi.mock('@/lib/auth/context', () => ({
  getTokenAuth: mocks.getTokenAuth,
  getSessionAuth: mocks.getSessionAuth,
  assertSameOrigin: mocks.assertSameOrigin,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => adminHolder.client,
}));

import { GET as tokensGet, POST as tokensPost } from '@/app/api/v1/tokens/route';
import { DELETE as tokenDelete } from '@/app/api/v1/tokens/[id]/route';
import { GET as meGet } from '@/app/api/v1/me/route';

const USER_ID = 'user-1';
const TOKEN_ID = 'token-1';
const SECRET = 'pawpress-test-secret-0123456789abcdef';

function buildAdmin(): FakeAdmin {
  const users = new Map();
  users.set(USER_ID, {
    id: USER_ID,
    email: 'a@b.c',
    app_metadata: {
      pawpress_tokens: [
        {
          id: TOKEN_ID,
          name: 'agent',
          scopes: ['posts:read'],
          created_at: '2026-01-01T00:00:00.000Z',
          expires_at: '2999-01-01T00:00:00.000Z',
        },
      ],
    },
  });
  const profiles = new Map([[USER_ID, { role: 'admin' }]]);
  return makeFakeAdmin({ users, profiles });
}

function sessionAuth(scopes: readonly Scope[] = ALL_SCOPES): AuthContext {
  return {
    via: 'session',
    userId: USER_ID,
    email: 'a@b.c',
    role: 'admin',
    scopes: [...scopes],
    db: adminHolder.client as never,
  };
}

function tokenAuth(scopes: Scope[]): AuthContext {
  return {
    via: 'token',
    userId: USER_ID,
    email: 'a@b.c',
    role: 'admin',
    scopes,
    tokenId: TOKEN_ID,
    db: adminHolder.client as never,
  };
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

let fake: FakeAdmin;

beforeEach(() => {
  vi.clearAllMocks();
  fake = buildAdmin();
  adminHolder.client = fake.client;
  mocks.assertSameOrigin.mockImplementation(() => undefined);
  vi.stubEnv('PAWPRESS_TOKEN_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const routeCtx = { params: Promise.resolve({}) };

describe('GET /api/v1/tokens', () => {
  it('lists the caller tokens', async () => {
    mocks.getSessionAuth.mockResolvedValue(sessionAuth());

    const response = await tokensGet(
      new Request('http://test.local/api/v1/tokens'),
      routeCtx,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: TOKEN_ID, name: 'agent' });
  });
});

describe('POST /api/v1/tokens', () => {
  it('creates a token and returns it once', async () => {
    mocks.getSessionAuth.mockResolvedValue(sessionAuth());

    const response = await tokensPost(
      jsonRequest('http://test.local/api/v1/tokens', 'POST', {
        name: 'new agent',
        scopes: ['posts:read', 'media:upload'],
      }),
      routeCtx,
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.token.startsWith('pp_')).toBe(true);
    expect(body.meta).toMatchObject({
      name: 'new agent',
      scopes: ['posts:read', 'media:upload'],
    });

    const stored = fake.state.users.get(USER_ID)?.app_metadata
      .pawpress_tokens as unknown[];
    expect(stored).toHaveLength(2);
  });

  it('rejects an invalid body with 400', async () => {
    mocks.getSessionAuth.mockResolvedValue(sessionAuth());

    const response = await tokensPost(
      jsonRequest('http://test.local/api/v1/tokens', 'POST', { name: '' }),
      routeCtx,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('validation_failed');
  });
});

describe('DELETE /api/v1/tokens/:id', () => {
  it('revokes an owned token', async () => {
    mocks.getSessionAuth.mockResolvedValue(sessionAuth());

    const response = await tokenDelete(
      new Request('http://test.local/api/v1/tokens/token-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: TOKEN_ID }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true, id: TOKEN_ID });
  });

  it('returns 404 for an unknown token', async () => {
    mocks.getSessionAuth.mockResolvedValue(sessionAuth());

    const response = await tokenDelete(
      new Request('http://test.local/api/v1/tokens/ghost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'ghost' }) },
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('not_found');
  });
});

describe('GET /api/v1/me', () => {
  it('returns the user and effective token metadata', async () => {
    mocks.getTokenAuth.mockResolvedValue(tokenAuth(['posts:read']));

    const response = await meGet(
      new Request('http://test.local/api/v1/me'),
      routeCtx,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      user: { id: USER_ID, email: 'a@b.c', role: 'admin' },
      token: {
        id: TOKEN_ID,
        name: 'agent',
        scopes: ['posts:read'],
        expires_at: '2999-01-01T00:00:00.000Z',
      },
    });
  });
});
