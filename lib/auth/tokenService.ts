import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError, fromZodError } from '@/lib/cms/errors';
import { ROLE_SCOPES, isScope, type Role, type Scope } from '@/lib/cms/permissions';
import {
  DEFAULT_TOKEN_DAYS,
  MAX_TOKEN_DAYS,
  mintToken,
} from './tokens';
import type { TokenMeta, TokenStore } from './tokenStore';

const scopeSchema = z.custom<Scope>((value) => isScope(value), {
  message: 'Unknown scope',
});

const createTokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters'),
  scopes: z
    .array(scopeSchema)
    .min(1, 'At least one scope is required'),
  expires_in_days: z
    .number()
    .int('expires_in_days must be an integer')
    .min(1, 'expires_in_days must be at least 1')
    .max(MAX_TOKEN_DAYS, `expires_in_days must be at most ${MAX_TOKEN_DAYS}`)
    .default(DEFAULT_TOKEN_DAYS),
});

export interface CreateTokenInput {
  name: string;
  scopes: Scope[];
  expires_in_days?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rejects scopes the caller's current role does not grant. An unknown role
 * grants nothing.
 */
export function assertScopesAllowed(
  scopes: readonly Scope[],
  role: Role,
): void {
  const allowed = ROLE_SCOPES[role] as readonly Scope[] | undefined;
  const allowedSet = new Set<string>(allowed ?? []);
  const offending = scopes.filter((scope) => !allowedSet.has(scope));

  if (offending.length > 0) {
    throw ApiError.forbidden('Requested scopes exceed your role', {
      scopes: offending,
    });
  }
}

export interface CreateTokenDeps {
  store: TokenStore;
  userId: string;
  role: Role;
  input: unknown;
  now?: Date;
}

export interface CreateTokenResult {
  token: string;
  meta: TokenMeta;
}

/**
 * Validates a token creation request, persists its metadata then mints the
 * token. If minting fails the freshly added entry is revoked again so a broken
 * secret does not leave a dangling (unusable) token behind.
 */
export async function createToken(
  deps: CreateTokenDeps,
): Promise<CreateTokenResult> {
  const parsed = createTokenSchema.safeParse(deps.input);
  if (!parsed.success) {
    throw fromZodError(parsed.error);
  }

  const scopes = [...new Set(parsed.data.scopes)];
  assertScopesAllowed(scopes, deps.role);

  const now = deps.now ?? new Date();
  const expiresAt = new Date(
    now.getTime() + parsed.data.expires_in_days * DAY_MS,
  );

  const meta: TokenMeta = {
    id: randomUUID(),
    name: parsed.data.name,
    scopes,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  await deps.store.add(deps.userId, meta);

  try {
    const token = await mintToken({
      userId: deps.userId,
      tokenId: meta.id,
      scopes,
      expiresAt,
    });
    return { token, meta };
  } catch (error) {
    await deps.store.revoke(deps.userId, meta.id).catch(() => {
      // Best-effort rollback; the original minting error is what matters.
    });
    throw error;
  }
}
