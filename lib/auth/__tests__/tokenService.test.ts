import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/cms/errors';
import type { Role, Scope } from '@/lib/cms/permissions';
import {
  assertScopesAllowed,
  createToken,
  type CreateTokenDeps,
} from '../tokenService';
import type { TokenMeta, TokenStore } from '../tokenStore';

const SECRET = 'pawpress-test-secret-0123456789abcdef';
const DAY_MS = 24 * 60 * 60 * 1000;
const USER_ID = 'user-1';

interface MemoryStore extends TokenStore {
  entries: Map<string, TokenMeta[]>;
}

function makeMemoryStore(): MemoryStore {
  const entries = new Map<string, TokenMeta[]>();

  return {
    entries,
    async list(userId) {
      return [...(entries.get(userId) ?? [])];
    },
    async add(userId, meta) {
      entries.set(userId, [...(entries.get(userId) ?? []), meta]);
    },
    async revoke(userId, tokenId) {
      const current = entries.get(userId) ?? [];
      const next = current.filter((meta) => meta.id !== tokenId);
      entries.set(userId, next);
      return next.length !== current.length;
    },
    async isActive(userId, tokenId) {
      return (entries.get(userId) ?? []).some((meta) => meta.id === tokenId);
    },
  };
}

function deps(overrides?: Partial<CreateTokenDeps>): CreateTokenDeps {
  return {
    store: makeMemoryStore(),
    userId: USER_ID,
    role: 'admin',
    input: { name: 'agent', scopes: ['posts:read'] as Scope[] },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv('PAWPRESS_TOKEN_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('assertScopesAllowed', () => {
  it('allows scopes granted by the role', () => {
    expect(() =>
      assertScopesAllowed(['posts:read', 'posts:publish'], 'admin'),
    ).not.toThrow();
  });

  it('rejects scopes the role does not grant', () => {
    expect(() =>
      assertScopesAllowed(['posts:read'], 'viewer' as Role),
    ).toThrowError(/exceed/);
  });
});

describe('createToken', () => {
  it('stores metadata then mints a usable token', async () => {
    const store = makeMemoryStore();
    const now = new Date('2026-01-01T00:00:00.000Z');

    const { token, meta } = await createToken(deps({ store, now }));

    expect(token.startsWith('pp_')).toBe(true);
    expect(meta.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(meta.name).toBe('agent');
    expect(meta.scopes).toEqual(['posts:read']);
    expect(meta.created_at).toBe(now.toISOString());
    expect(Date.parse(meta.expires_at) - Date.parse(meta.created_at)).toBe(
      30 * DAY_MS,
    );
    expect(await store.list(USER_ID)).toEqual([meta]);
  });

  it('dedupes scopes and honours expires_in_days', async () => {
    const store = makeMemoryStore();
    const now = new Date('2026-01-01T00:00:00.000Z');

    const { meta } = await createToken(
      deps({
        store,
        now,
        input: {
          name: 'agent',
          scopes: ['posts:read', 'posts:read', 'media:upload'],
          expires_in_days: 5,
        },
      }),
    );

    expect(meta.scopes).toEqual(['posts:read', 'media:upload']);
    expect(Date.parse(meta.expires_at) - Date.parse(meta.created_at)).toBe(
      5 * DAY_MS,
    );
  });

  it('trims the name and rejects an empty one', async () => {
    const store = makeMemoryStore();
    const { meta } = await createToken(
      deps({ store, input: { name: '  spaced  ', scopes: ['posts:read'] } }),
    );
    expect(meta.name).toBe('spaced');

    await expect(
      createToken(deps({ store, input: { name: '   ', scopes: ['posts:read'] } })),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('rejects scopes outside the role with 403', async () => {
    const store = makeMemoryStore();
    await expect(
      createToken(
        deps({
          store,
          role: 'viewer' as Role,
          input: { name: 'agent', scopes: ['posts:read'] },
        }),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(store.entries.size).toBe(0);
  });

  it('rejects an invalid body with 400', async () => {
    await expect(
      createToken(deps({ input: { name: '', scopes: [] } })),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('rolls back the stored entry when minting fails', async () => {
    vi.stubEnv('PAWPRESS_TOKEN_SECRET', '');
    const store = makeMemoryStore();

    await expect(createToken(deps({ store }))).rejects.toMatchObject({
      code: 'internal',
    });
    expect(store.entries.get(USER_ID)).toEqual([]);
  });

  it('surfaces an ApiError for a bad store conflict', async () => {
    const store = makeMemoryStore();
    store.add = async () => {
      throw ApiError.conflict('too many');
    };

    await expect(createToken(deps({ store }))).rejects.toMatchObject({
      code: 'conflict',
    });
  });
});
