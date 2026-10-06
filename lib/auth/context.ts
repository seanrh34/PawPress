import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/cms/errors';
import {
  ROLE_SCOPES,
  effectiveScopes,
  isRole,
  type Role,
  type Scope,
} from '@/lib/cms/permissions';
import { createAdminClient } from '@/lib/supabase-admin';
import { createClient as createServerSupabaseClient } from '@/lib/supabase-server';
import { verifyToken } from './tokens';
import { AppMetadataTokenStore, type TokenStore } from './tokenStore';

export type AuthContext =
  | {
      via: 'token';
      userId: string;
      email: string;
      role: Role;
      scopes: Scope[];
      tokenId: string;
      db: SupabaseClient;
    }
  | {
      via: 'session';
      userId: string;
      email: string;
      role: Role;
      scopes: Scope[];
      db: SupabaseClient;
    };

const UNAUTHORIZED_MESSAGE = 'Unauthorized';
const UNAUTHORIZED = () => ApiError.unauthorized(UNAUTHORIZED_MESSAGE);

export interface TokenAuthDeps {
  admin?: SupabaseClient;
  tokenStore?: TokenStore;
}

export interface SessionAuthDeps {
  db?: SupabaseClient;
}

function parseBearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Resolves the caller's role from `user_profiles`. A missing profile or an
 * unknown role is treated as no role at all.
 */
async function loadRole(
  db: SupabaseClient,
  userId: string,
): Promise<Role | null> {
  const { data, error } = await db
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const role = (data as { role?: unknown }).role;
  return isRole(role) ? role : null;
}

/**
 * Authenticates a request via `Authorization: Bearer pp_…`. Any failure along
 * the way (missing/malformed token, bad signature, revoked token, deleted user,
 * missing profile, unknown role) throws the same generic 401 so callers cannot
 * probe which check failed.
 *
 * Dependencies can be injected so tests do not need environment variables.
 */
export async function getTokenAuth(
  req: Request,
  deps: TokenAuthDeps = {},
): Promise<AuthContext> {
  try {
    const raw = parseBearerToken(req.headers.get('authorization'));
    if (!raw) {
      throw UNAUTHORIZED();
    }

    const verified = await verifyToken(raw);
    if (!verified) {
      throw UNAUTHORIZED();
    }

    const admin = deps.admin ?? createAdminClient();
    const tokenStore = deps.tokenStore ?? new AppMetadataTokenStore(admin);

    const { data, error } = await admin.auth.admin.getUserById(verified.userId);
    const user = data?.user;
    if (error || !user) {
      throw UNAUTHORIZED();
    }

    const active = await tokenStore.isActive(verified.userId, verified.tokenId);
    if (!active) {
      throw UNAUTHORIZED();
    }

    const role = await loadRole(admin, verified.userId);
    if (!role) {
      throw UNAUTHORIZED();
    }

    return {
      via: 'token',
      userId: verified.userId,
      email: user.email ?? '',
      role,
      scopes: effectiveScopes(verified.scopes, role),
      tokenId: verified.tokenId,
      db: admin,
    };
  } catch (error) {
    // Expected auth failures are already ApiErrors. Anything else (e.g. a
    // Supabase outage) still fails closed, but is logged so it isn't silently
    // reported as a bad token. Never log the request or token.
    if (!(error instanceof ApiError)) {
      console.error('Token authentication failed unexpectedly:', error);
    }
    throw UNAUTHORIZED();
  }
}

/**
 * Authenticates a request via the Supabase cookie session (the browser admin).
 * Dependencies can be injected so tests do not need environment variables.
 */
export async function getSessionAuth(
  deps: SessionAuthDeps = {},
): Promise<AuthContext> {
  const db = deps.db ?? (await createServerSupabaseClient());

  const {
    data: { user },
    error,
  } = await db.auth.getUser();

  if (error || !user) {
    throw UNAUTHORIZED();
  }

  const role = await loadRole(db, user.id);
  if (!role) {
    throw UNAUTHORIZED();
  }

  return {
    via: 'session',
    userId: user.id,
    email: user.email ?? '',
    role,
    scopes: [...ROLE_SCOPES[role]],
    db,
  };
}

/**
 * Rejects cross-origin cookie-session mutations by comparing the `Origin`
 * header's host with the request host (`x-forwarded-host` when present).
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  const host =
    req.headers.get('x-forwarded-host') ?? req.headers.get('host');

  if (!origin || !host) {
    throw ApiError.forbidden('Cross-origin request rejected');
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw ApiError.forbidden('Cross-origin request rejected');
  }

  if (originHost !== host) {
    throw ApiError.forbidden('Cross-origin request rejected');
  }
}
