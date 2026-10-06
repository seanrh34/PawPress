import { ApiError } from './errors';

export type Scope =
  | 'posts:read'
  | 'posts:write'
  | 'posts:publish'
  | 'posts:delete'
  | 'categories:write'
  | 'media:upload';

export const ALL_SCOPES: readonly Scope[] = [
  'posts:read',
  'posts:write',
  'posts:publish',
  'posts:delete',
  'categories:write',
  'media:upload',
];

export type Role = 'master' | 'admin';

export const ROLE_SCOPES: Record<Role, readonly Scope[]> = {
  master: ALL_SCOPES,
  admin: ALL_SCOPES,
};

export const DEFAULT_TOKEN_SCOPES: readonly Scope[] = [
  'posts:read',
  'posts:write',
  'media:upload',
];

export function isScope(value: unknown): value is Scope {
  return typeof value === 'string' && (ALL_SCOPES as readonly string[]).includes(value);
}

export function isRole(value: unknown): value is Role {
  return value === 'master' || value === 'admin';
}

/**
 * The scopes a token actually has for the owner's current role: the token's
 * requested scopes intersected with the scopes granted by that role. Unknown
 * roles grant nothing.
 */
export function effectiveScopes(tokenScopes: readonly Scope[], role: Role): Scope[] {
  const allowed = ROLE_SCOPES[role];
  if (!allowed) {
    return [];
  }

  const requested = new Set(tokenScopes);
  return allowed.filter((scope) => requested.has(scope));
}

export interface ScopeContext {
  scopes: readonly Scope[];
}

export function assertScope(ctx: ScopeContext, scope: Scope): void {
  if (!ctx.scopes.includes(scope)) {
    throw ApiError.forbidden(`Missing required scope: ${scope}`);
  }
}

export interface PostStatusSnapshot {
  published_at: string | null;
}

export type PostStatus = 'draft' | 'published';

function statusOf(current: PostStatusSnapshot): PostStatus {
  return current.published_at !== null ? 'published' : 'draft';
}

/**
 * Scopes needed to update a post: always `posts:write`; `posts:publish` is also
 * required when the post is currently published or when the update changes its
 * status.
 */
export function requiredScopesForPostUpdate(
  current: PostStatusSnapshot,
  patch: { status?: PostStatus },
): Scope[] {
  const scopes = new Set<Scope>(['posts:write']);

  if (current.published_at !== null) {
    scopes.add('posts:publish');
  }

  if (patch.status !== undefined && patch.status !== statusOf(current)) {
    scopes.add('posts:publish');
  }

  return [...scopes];
}

/**
 * Scopes needed to create a post: `posts:write`, plus `posts:publish` when it
 * is created directly as published.
 */
export function requiredScopesForPostCreate(input: { status?: PostStatus }): Scope[] {
  const scopes: Scope[] = ['posts:write'];

  if (input.status === 'published') {
    scopes.push('posts:publish');
  }

  return scopes;
}
