import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/cms/errors';
import type { Scope } from '@/lib/cms/permissions';
import { mintToken } from '../tokens';
import { AppMetadataTokenStore, type TokenMeta } from '../tokenStore';
import {
  assertSameOrigin,
  getSessionAuth,
  getTokenAuth,
} from '../context';
import {
  makeFakeAdmin,
  makeFakeSessionClient,
  type FakeAdmin,
} from './fakes';

const SECRET = 'pawpress-test-secret-0123456789abcdef';
const USER_ID = 'user-1';
const EMAIL = 'admin@example.com';
const TOKEN_ID = 'token-1';
const EXPIRES_AT = new Date(Date.now() + 60 * 60 * 1000);

function tokenMeta(overrides?: Partial<TokenMeta>): TokenMeta {
  return {
    id: TOKEN_ID,
    name: 'agent',
    scopes: ['posts:read'],
    created_at: new Date().toISOString(),
    expires_at: EXPIRES_AT.toISOString(),
    ...overrides,
  };
}

function buildFake(options: {
  role?: unknown;
  withUser?: boolean;
  withProfile?: boolean;
  tokens?: TokenMeta[];
  bannedUntil?: string | null;
  deletedAt?: string | null;
}): FakeAdmin {
  const users = new Map();
  const profiles = new Map();

  if (options.withUser !== false) {
    users.set(USER_ID, {
      id: USER_ID,
      email: EMAIL,
      app_metadata: { pawpress_tokens: options.tokens ?? [] },
      banned_until: options.bannedUntil ?? null,
      deleted_at: options.deletedAt ?? null,
    });
  }

  if (options.withProfile !== false) {
    profiles.set(USER_ID, { role: options.role ?? 'admin' });
  }

  return makeFakeAdmin({ users, profiles });
}

function tokenRequest(raw: string, scheme = 'Bearer') {
  return new Request('http://test.local/api/v1/me', {
    headers: { authorization: `${scheme} ${raw}` },
  });
}

async function callTokenAuth(
  fake: FakeAdmin,
  raw: string,
  scheme?: string,
) {
  const store = new AppMetadataTokenStore(fake.client);
  return getTokenAuth(tokenRequest(raw, scheme), {
    admin: fake.client,
    tokenStore: store,
  });
}

beforeEach(() => {
  vi.stubEnv('PAWPRESS_TOKEN_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getTokenAuth', () => {
  it('resolves a happy-path token with effective scopes', async () => {
    const scopes: Scope[] = ['media:upload', 'posts:read'];
    const fake = buildFake({
      tokens: [tokenMeta({ scopes, expires_at: EXPIRES_AT.toISOString() })],
    });
    const raw = await mintToken({
      userId: USER_ID,
      tokenId: TOKEN_ID,
      scopes,
      expiresAt: EXPIRES_AT,
    });

    const auth = await callTokenAuth(fake, raw);

    expect(auth).toMatchObject({
      via: 'token',
      userId: USER_ID,
      email: EMAIL,
      role: 'admin',
      scopes: ['posts:read', 'media:upload'],
      tokenId: TOKEN_ID,
      db: fake.client,
    });
  });

  it('accepts a case-insensitive bearer scheme', async () => {
    const fake = buildFake({ tokens: [tokenMeta()] });
    const raw = await mintToken({
      userId: USER_ID,
      tokenId: TOKEN_ID,
      scopes: ['posts:read'],
      expiresAt: EXPIRES_AT,
    });

    const auth = await callTokenAuth(fake, raw, 'bearer');
    expect(auth.via).toBe('token');
  });

  it('rejects a revoked jti', async () => {
    const fake = buildFake({ tokens: [tokenMeta({ id: 'other-token' })] });
    const raw = await mintToken({
      userId: USER_ID,
      tokenId: TOKEN_ID,
      scopes: ['posts:read'],
      expiresAt: EXPIRES_AT,
    });

    await expect(callTokenAuth(fake, raw)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('rejects a deleted user', async () => {
    const fake = buildFake({ withUser: false, tokens: [tokenMeta()] });
    const raw = await mintToken({
      userId: USER_ID,
      tokenId: TOKEN_ID,
      scopes: ['posts:read'],
      expiresAt: EXPIRES_AT,
    });

    await expect(callTokenAuth(fake, raw)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('rejects a missing profile', async () => {
    const fake = buildFake({
      withProfile: false,
      tokens: [tokenMeta()],
    });
    const raw = await mintToken({
      userId: USER_ID,
      tokenId: TOKEN_ID,
      scopes: ['posts:read'],
      expiresAt: EXPIRES_AT,
    });

    await expect(callTokenAuth(fake, raw)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('rejects a user banned in the future', async () => {
    const fake = buildFake({
      tokens: [tokenMeta()],
      bannedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    const raw = await mintToken({
      userId: USER_ID,
      tokenId: TOKEN_ID,
      scopes: ['posts:read'],
      expiresAt: EXPIRES_AT,
    });

    await expect(callTokenAuth(fake, raw)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('accepts a user whose ban has expired', async () => {
    const fake = buildFake({
      tokens: [tokenMeta()],
      bannedUntil: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const raw = await mintToken({
      userId: USER_ID,
      tokenId: TOKEN_ID,
      scopes: ['posts:read'],
      expiresAt: EXPIRES_AT,
    });

    const auth = await callTokenAuth(fake, raw);
    expect(auth.via).toBe('token');
  });

  it('rejects a soft-deleted user', async () => {
    const fake = buildFake({
      tokens: [tokenMeta()],
      deletedAt: new Date().toISOString(),
    });
    const raw = await mintToken({
      userId: USER_ID,
      tokenId: TOKEN_ID,
      scopes: ['posts:read'],
      expiresAt: EXPIRES_AT,
    });

    await expect(callTokenAuth(fake, raw)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('ignores null banned_until/deleted_at', async () => {
    const fake = buildFake({
      tokens: [tokenMeta()],
      bannedUntil: null,
      deletedAt: null,
    });
    const raw = await mintToken({
      userId: USER_ID,
      tokenId: TOKEN_ID,
      scopes: ['posts:read'],
      expiresAt: EXPIRES_AT,
    });

    await expect(callTokenAuth(fake, raw)).resolves.toMatchObject({
      via: 'token',
    });
  });

  it('rejects an unknown or demoted role', async () => {
    const fake = buildFake({ role: 'viewer', tokens: [tokenMeta()] });
    const raw = await mintToken({
      userId: USER_ID,
      tokenId: TOKEN_ID,
      scopes: ['posts:read'],
      expiresAt: EXPIRES_AT,
    });

    await expect(callTokenAuth(fake, raw)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('rejects when the signing secret is missing', async () => {
    const fake = buildFake({ tokens: [tokenMeta()] });
    const raw = await mintToken({
      userId: USER_ID,
      tokenId: TOKEN_ID,
      scopes: ['posts:read'],
      expiresAt: EXPIRES_AT,
    });

    vi.stubEnv('PAWPRESS_TOKEN_SECRET', '');
    await expect(callTokenAuth(fake, raw)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('returns the same generic 401 message for every failure mode', async () => {
    const valid = await mintToken({
      userId: USER_ID,
      tokenId: TOKEN_ID,
      scopes: ['posts:read'],
      expiresAt: EXPIRES_AT,
    });

    const scenarios: (() => Promise<unknown>)[] = [
      () => callTokenAuth(buildFake({ tokens: [tokenMeta()] }), 'pp_not-a-token'),
      () =>
        callTokenAuth(buildFake({ tokens: [tokenMeta({ id: 'x' })] }), valid),
      () => callTokenAuth(buildFake({ withUser: false }), valid),
      () => callTokenAuth(buildFake({ withProfile: false }), valid),
      () => callTokenAuth(buildFake({ role: 'viewer' }), valid),
      async () => getTokenAuth(new Request('http://test.local/api/v1/me')),
    ];

    const messages: string[] = [];
    for (const run of scenarios) {
      try {
        await run();
        throw new Error('expected unauthorized');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        messages.push((error as ApiError).message);
      }
    }

    expect(new Set(messages).size).toBe(1);
  });
});

describe('getSessionAuth', () => {
  it('resolves a cookie session with role scopes', async () => {
    const db = makeFakeSessionClient({ userId: USER_ID, role: 'admin' });
    const auth = await getSessionAuth({ db });

    expect(auth).toMatchObject({
      via: 'session',
      userId: USER_ID,
      email: 'admin@example.com',
      role: 'admin',
    });
    expect(auth).not.toHaveProperty('tokenId');
    expect(auth.scopes).toContain('posts:publish');
  });

  it('rejects no session', async () => {
    const db = makeFakeSessionClient({ userId: null });
    await expect(getSessionAuth({ db })).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('rejects a missing profile', async () => {
    const db = makeFakeSessionClient({ userId: USER_ID, hasProfile: false });
    await expect(getSessionAuth({ db })).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('rejects an unknown role', async () => {
    const db = makeFakeSessionClient({ userId: USER_ID, role: 'viewer' });
    await expect(getSessionAuth({ db })).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });
});

describe('assertSameOrigin', () => {
  function request(headers: Record<string, string>) {
    return new Request('http://test.local/api/v1/tokens', { headers });
  }

  it('accepts a matching origin', () => {
    expect(() =>
      assertSameOrigin(
        request({ host: 'test.local', origin: 'https://test.local' }),
      ),
    ).not.toThrow();
  });

  it('prefers x-forwarded-host and includes ports', () => {
    expect(() =>
      assertSameOrigin(
        request({
          host: 'internal:3000',
          'x-forwarded-host': 'test.local:3000',
          origin: 'http://test.local:3000',
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a missing origin', () => {
    expect(() => assertSameOrigin(request({ host: 'test.local' }))).toThrow(
      /Cross-origin/,
    );
  });

  it('rejects a mismatched origin', () => {
    expect(() =>
      assertSameOrigin(
        request({ host: 'test.local', origin: 'https://evil.example' }),
      ),
    ).toThrow(/Cross-origin/);
  });

  it('rejects an unparseable origin', () => {
    expect(() =>
      assertSameOrigin(request({ host: 'test.local', origin: 'not a url' })),
    ).toThrow(/Cross-origin/);
  });
});
