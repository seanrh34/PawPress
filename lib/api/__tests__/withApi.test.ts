import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError } from '@/lib/cms/errors';
import { ALL_SCOPES, type Scope } from '@/lib/cms/permissions';
import type { AuthContext } from '@/lib/auth/context';

const mocks = vi.hoisted(() => ({
  getTokenAuth: vi.fn(),
  getSessionAuth: vi.fn(),
  assertSameOrigin: vi.fn(),
}));

vi.mock('@/lib/auth/context', () => ({
  getTokenAuth: mocks.getTokenAuth,
  getSessionAuth: mocks.getSessionAuth,
  assertSameOrigin: mocks.assertSameOrigin,
}));

import { audit, withApi } from '../withApi';

const db = {} as SupabaseClient;
const routeCtx = { params: Promise.resolve({}) };

function tokenAuth(scopes: Scope[] = ['posts:read']): AuthContext {
  return {
    via: 'token',
    userId: 'user-1',
    email: 'a@b.c',
    role: 'admin',
    scopes,
    tokenId: 'token-1',
    db,
  };
}

function sessionAuth(scopes: readonly Scope[] = ALL_SCOPES): AuthContext {
  return {
    via: 'session',
    userId: 'user-1',
    email: 'a@b.c',
    role: 'admin',
    scopes: [...scopes],
    db,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertSameOrigin.mockImplementation(() => undefined);
});

describe('withApi authentication', () => {
  it('returns 401 without calling the handler', async () => {
    mocks.getTokenAuth.mockRejectedValue(ApiError.unauthorized());
    const handler = vi.fn(async () => new Response('ok'));

    const response = await withApi(handler, { auth: 'token' })(
      new Request('http://test.local/api/v1/me'),
      routeCtx,
    );

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      error: { code: 'unauthorized', message: 'Unauthorized' },
    });
  });

  it('returns 403 for a missing scope without calling the handler', async () => {
    mocks.getTokenAuth.mockResolvedValue(tokenAuth(['posts:read']));
    const handler = vi.fn(async () => new Response('ok'));

    const response = await withApi(handler, {
      auth: 'token',
      scope: 'posts:publish',
    })(new Request('http://test.local/api/v1/posts'), routeCtx);

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes auth and params to the handler on success', async () => {
    mocks.getTokenAuth.mockResolvedValue(tokenAuth(['posts:read']));
    const handler = vi.fn(
      async (_req: Request, ctx: { params: unknown }) => {
        expect(ctx.params).toEqual({ id: 'p1' });
        return new Response('ok', { status: 200 });
      },
    );

    const response = await withApi(handler, { auth: 'token' })(
      new Request('http://test.local/api/v1/posts/p1'),
      { params: Promise.resolve({ id: 'p1' }) },
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('withApi session mutations', () => {
  it('does not require an Origin for GET', async () => {
    mocks.getSessionAuth.mockResolvedValue(sessionAuth());
    const handler = vi.fn(async () => new Response('ok'));

    await withApi(handler, { auth: 'session' })(
      new Request('http://test.local/api/v1/tokens', { method: 'GET' }),
      routeCtx,
    );

    expect(mocks.assertSameOrigin).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('enforces the Origin check for mutations', async () => {
    mocks.getSessionAuth.mockResolvedValue(sessionAuth());
    mocks.assertSameOrigin.mockImplementation(() => {
      throw ApiError.forbidden('Cross-origin request rejected');
    });
    const handler = vi.fn(async () => new Response('ok'));

    const response = await withApi(handler, { auth: 'session' })(
      new Request('http://test.local/api/v1/tokens', { method: 'POST' }),
      routeCtx,
    );

    expect(mocks.assertSameOrigin).toHaveBeenCalledOnce();
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('withApi error mapping', () => {
  it('maps a ZodError to a 400 validation_failed shape', async () => {
    mocks.getTokenAuth.mockResolvedValue(tokenAuth());
    const schema = z.object({ title: z.string() });
    const handler = async () => {
      const result = schema.safeParse({});
      if (!result.success) {
        throw result.error;
      }
      return new Response('ok');
    };

    const response = await withApi(handler, { auth: 'token' })(
      new Request('http://test.local/api/v1/posts'),
      routeCtx,
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details.fields.title).toBeDefined();
  });

  it('maps invalid JSON from req.json() to a 400', async () => {
    mocks.getTokenAuth.mockResolvedValue(tokenAuth());
    const handler = async (req: Request) => {
      await req.json();
      return new Response('ok');
    };

    const response = await withApi(handler, { auth: 'token' })(
      new Request('http://test.local/api/v1/posts', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }),
      routeCtx,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'validation_failed', message: 'Invalid JSON body' },
    });
  });

  it('maps unknown errors to a generic 500 without leaking the message', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getTokenAuth.mockResolvedValue(tokenAuth());
    const handler = async () => {
      throw new Error('relation "secret_table" does not exist');
    };

    const response = await withApi(handler, { auth: 'token' })(
      new Request('http://test.local/api/v1/posts'),
      routeCtx,
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: { code: 'internal', message: 'Internal server error' },
    });
    expect(JSON.stringify(body)).not.toContain('secret_table');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('audit', () => {
  it('emits the documented audit line for a token request', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    audit({ auth: tokenAuth(), params: {} }, 'post.update', 'post', 'p1');

    const line = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(Object.keys(line)).toEqual([
      'evt',
      'action',
      'resource',
      'id',
      'userId',
      'tokenId',
      'ts',
    ]);
    expect(line).toMatchObject({
      evt: 'pawpress.audit',
      action: 'post.update',
      resource: 'post',
      id: 'p1',
      userId: 'user-1',
      tokenId: 'token-1',
    });
    expect(typeof line.ts).toBe('string');

    infoSpy.mockRestore();
  });

  it('uses a null tokenId for session requests', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    audit({ auth: sessionAuth(), params: {} }, 'token.create', 'token', 't1');

    const line = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(line.tokenId).toBeNull();

    infoSpy.mockRestore();
  });
});
