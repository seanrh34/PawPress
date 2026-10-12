import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/cms/errors';
import type { Scope } from '@/lib/cms/permissions';
import {
  DEFAULT_TOKEN_DAYS,
  MAX_ACTIVE_TOKENS,
  MAX_TOKEN_DAYS,
  mintToken,
  verifyToken,
} from '../tokens';

const SECRET = 'pawpress-test-secret-0123456789abcdef';
const OTHER_SECRET = 'pawpress-other-secret-0123456789abcdef';

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

async function mint(overrides?: {
  userId?: string;
  tokenId?: string;
  scopes?: Scope[];
  expiresAt?: Date;
}) {
  return mintToken({
    userId: overrides?.userId ?? 'user-1',
    tokenId: overrides?.tokenId ?? 'token-1',
    scopes: overrides?.scopes ?? ['posts:read'],
    expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
  });
}

beforeEach(() => {
  vi.stubEnv('PAWPRESS_TOKEN_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('token constants', () => {
  it('exposes the documented limits', () => {
    expect(DEFAULT_TOKEN_DAYS).toBe(30);
    expect(MAX_TOKEN_DAYS).toBe(90);
    expect(MAX_ACTIVE_TOKENS).toBe(10);
  });
});

describe('mintToken / verifyToken', () => {
  it('round-trips a minted token with the pp_ prefix', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const token = await mint({ scopes: ['posts:read', 'media:upload'], expiresAt });

    expect(token.startsWith('pp_')).toBe(true);

    const verified = await verifyToken(token);
    expect(verified).toEqual({
      userId: 'user-1',
      tokenId: 'token-1',
      scopes: ['posts:read', 'media:upload'],
      exp: Math.floor(expiresAt.getTime() / 1000),
    });
  });

  it('drops unknown scopes from the payload', async () => {
    const token = await mint({ scopes: ['posts:read', 'bogus' as Scope] });
    const verified = await verifyToken(token);
    expect(verified?.scopes).toEqual(['posts:read']);
  });

  it('rejects an expired token', async () => {
    const token = await mint({ expiresAt: new Date(Date.now() - 1000) });
    expect(await verifyToken(token)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await mint();
    vi.stubEnv('PAWPRESS_TOKEN_SECRET', OTHER_SECRET);
    expect(await verifyToken(token)).toBeNull();
  });

  it('rejects a token with the wrong issuer', async () => {
    const jws = await new SignJWT({ scp: ['posts:read'] })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('not-pawpress')
      .setSubject('user-1')
      .setJti('token-1')
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(new TextEncoder().encode(SECRET));

    expect(await verifyToken(`pp_${jws}`)).toBeNull();
  });

  it('requires the pp_ prefix', async () => {
    const token = await mint();
    expect(await verifyToken(token.slice(3))).toBeNull();
    expect(await verifyToken('')).toBeNull();
  });

  it('rejects an alg:none token', async () => {
    const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const now = Math.floor(Date.now() / 1000);
    const payload = base64url(
      JSON.stringify({
        iss: 'pawpress',
        sub: 'user-1',
        jti: 'token-1',
        scp: ['posts:read'],
        iat: now,
        exp: now + 3600,
      }),
    );

    expect(await verifyToken(`pp_${header}.${payload}.`)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await mint();
    const [header, payload, signature] = token.slice(3).split('.');
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    decoded.sub = 'attacker';
    const tampered = `pp_${header}.${base64url(JSON.stringify(decoded))}.${signature}`;

    expect(await verifyToken(tampered)).toBeNull();
  });
});

describe('missing or short secret', () => {
  it('verifyToken returns null and mintToken throws internal', async () => {
    const token = await mint();

    vi.stubEnv('PAWPRESS_TOKEN_SECRET', '');
    expect(await verifyToken(token)).toBeNull();
    await expect(mint()).rejects.toMatchObject({ code: 'internal' });

    vi.stubEnv('PAWPRESS_TOKEN_SECRET', 'too-short');
    expect(await verifyToken(token)).toBeNull();
    await expect(mint()).rejects.toBeInstanceOf(ApiError);
  });

  it('warns once per process without logging the secret', async () => {
    vi.resetModules();
    vi.stubEnv('PAWPRESS_TOKEN_SECRET', '');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const fresh = await import('../tokens');
    await fresh.verifyToken('pp_whatever');
    await fresh.verifyToken('pp_whatever');
    await fresh
      .mintToken({
        userId: 'user-1',
        tokenId: 'token-1',
        scopes: ['posts:read'],
        expiresAt: new Date(Date.now() + 60_000),
      })
      .catch(() => undefined);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain('PAWPRESS_TOKEN_SECRET');
    expect(logged).not.toContain(SECRET);
  });
});

describe('token logging hygiene', () => {
  it('never writes the token to any console channel', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];

    const token = await mint();
    await verifyToken(token);
    await verifyToken(`${token}tampered`);

    const output = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(output).not.toContain(token);

    spies.forEach((spy) => spy.mockRestore());
  });
});
