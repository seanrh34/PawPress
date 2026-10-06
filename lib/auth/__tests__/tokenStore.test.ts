import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/cms/errors';
import type { Scope } from '@/lib/cms/permissions';
import { AppMetadataTokenStore, type TokenMeta } from '../tokenStore';
import { makeFakeAdmin, type FakeAuthUser } from './fakes';

const USER_ID = 'user-1';

function meta(overrides?: Partial<TokenMeta>): TokenMeta {
  return {
    id: 'token-1',
    name: 'agent',
    scopes: ['posts:read'] as Scope[],
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2999-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup(initial?: Partial<FakeAuthUser>) {
  const users = new Map<string, FakeAuthUser>();
  users.set(USER_ID, {
    id: USER_ID,
    email: 'a@b.c',
    app_metadata: {},
    ...initial,
  });
  const fake = makeFakeAdmin({ users });
  return { fake, store: new AppMetadataTokenStore(fake.client) };
}

describe('AppMetadataTokenStore', () => {
  it('adds and lists tokens', async () => {
    const { store } = setup();
    await store.add(USER_ID, meta());

    expect(await store.list(USER_ID)).toEqual([meta()]);
    expect(await store.isActive(USER_ID, 'token-1')).toBe(true);
    expect(await store.isActive(USER_ID, 'nope')).toBe(false);
  });

  it('revokes a token and reports whether it existed', async () => {
    const { store } = setup();
    await store.add(USER_ID, meta());

    expect(await store.revoke(USER_ID, 'token-1')).toBe(true);
    expect(await store.list(USER_ID)).toEqual([]);
    expect(await store.revoke(USER_ID, 'token-1')).toBe(false);
  });

  it('prunes expired tokens on list and on write', async () => {
    const expired = meta({
      id: 'expired',
      expires_at: '2000-01-01T00:00:00.000Z',
    });
    const { fake, store } = setup({
      app_metadata: { pawpress_tokens: [expired] },
    });

    expect(await store.list(USER_ID)).toEqual([]);

    await store.add(USER_ID, meta({ id: 'fresh' }));

    const stored = fake.state.users.get(USER_ID)?.app_metadata
      .pawpress_tokens as TokenMeta[];
    expect(stored.map((entry) => entry.id)).toEqual(['fresh']);
  });

  it('rejects an 11th active token with a conflict', async () => {
    const { store } = setup();

    for (let index = 0; index < 10; index += 1) {
      await store.add(USER_ID, meta({ id: `token-${index}` }));
    }

    await expect(store.add(USER_ID, meta({ id: 'token-10' }))).rejects.toMatchObject(
      { code: 'conflict' },
    );
    expect(await store.list(USER_ID)).toHaveLength(10);
  });

  it('preserves unrelated app_metadata keys on write', async () => {
    const { fake, store } = setup({
      app_metadata: {
        provider: 'email',
        providers: ['email'],
        some_flag: true,
      },
    });

    await store.add(USER_ID, meta());

    const appMetadata = fake.state.users.get(USER_ID)?.app_metadata;
    expect(appMetadata).toMatchObject({
      provider: 'email',
      providers: ['email'],
      some_flag: true,
    });
    expect(appMetadata?.pawpress_tokens).toHaveLength(1);
  });

  it('ignores malformed stored entries', async () => {
    const { store } = setup({
      app_metadata: {
        pawpress_tokens: [
          meta(),
          42,
          null,
          { id: 'missing-fields' },
          { id: 'bad-scopes', name: 'x', scopes: ['nope'], created_at: 'a', expires_at: 'b' },
        ],
      },
    });

    expect(await store.list(USER_ID)).toEqual([meta()]);
  });

  it('returns empty results when the user is missing', async () => {
    const fake = makeFakeAdmin();
    const store = new AppMetadataTokenStore(fake.client);

    expect(await store.list('ghost')).toEqual([]);
    expect(await store.isActive('ghost', 'token-1')).toBe(false);
    expect(await store.revoke('ghost', 'token-1')).toBe(false);
    await expect(store.add('ghost', meta())).rejects.toBeInstanceOf(ApiError);
  });
});
