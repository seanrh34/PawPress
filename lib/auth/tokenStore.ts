import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ApiError } from '@/lib/cms/errors';
import { isScope, type Scope } from '@/lib/cms/permissions';
import { MAX_ACTIVE_TOKENS } from './tokens';

export interface TokenMeta {
  id: string;
  name: string;
  scopes: Scope[];
  created_at: string;
  expires_at: string;
}

export interface TokenStore {
  list(userId: string): Promise<TokenMeta[]>;
  add(userId: string, meta: TokenMeta): Promise<void>;
  revoke(userId: string, tokenId: string): Promise<boolean>;
  isActive(userId: string, tokenId: string): Promise<boolean>;
}

const STORAGE_KEY = 'pawpress_tokens';

function isTokenMeta(value: unknown): value is TokenMeta {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.scopes) &&
    candidate.scopes.every(isScope) &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.expires_at === 'string'
  );
}

function parseStoredList(value: unknown): TokenMeta[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isTokenMeta);
}

function isExpired(meta: TokenMeta, now: number): boolean {
  const expiresAt = Date.parse(meta.expires_at);
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

function pruneExpired(list: TokenMeta[], now: number): TokenMeta[] {
  return list.filter((meta) => !isExpired(meta, now));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Token store backed by the user's Supabase Auth `app_metadata`. This avoids a
 * schema change for v1; a future `api_tokens` table implementation can replace
 * it without touching callers.
 *
 * `app_metadata` is visible to the user in their own JWT, so only non-secret
 * metadata is ever stored here.
 */
export class AppMetadataTokenStore implements TokenStore {
  constructor(private readonly admin: SupabaseClient) {}

  async list(userId: string): Promise<TokenMeta[]> {
    const user = await this.readUser(userId);
    if (!user) {
      return [];
    }

    const metadata = isRecord(user.app_metadata) ? user.app_metadata : {};
    return pruneExpired(parseStoredList(metadata[STORAGE_KEY]), Date.now());
  }

  async add(userId: string, meta: TokenMeta): Promise<void> {
    // Read-modify-write: concurrent requests can drop a token. Acceptable for
    // v1; moving to an `api_tokens` table makes this atomic.
    const user = await this.readUser(userId);
    if (!user) {
      throw ApiError.internal('Unable to load token owner');
    }

    const metadata = isRecord(user.app_metadata) ? user.app_metadata : {};
    const now = Date.now();
    const active = pruneExpired(parseStoredList(metadata[STORAGE_KEY]), now);

    if (active.length >= MAX_ACTIVE_TOKENS) {
      throw ApiError.conflict(
        `You can have at most ${MAX_ACTIVE_TOKENS} active tokens`,
      );
    }

    await this.write(userId, metadata, [...active, meta]);
  }

  async revoke(userId: string, tokenId: string): Promise<boolean> {
    const user = await this.readUser(userId);
    if (!user) {
      return false;
    }

    const metadata = isRecord(user.app_metadata) ? user.app_metadata : {};
    const active = pruneExpired(
      parseStoredList(metadata[STORAGE_KEY]),
      Date.now(),
    );
    const remaining = active.filter((meta) => meta.id !== tokenId);

    if (remaining.length === active.length) {
      return false;
    }

    await this.write(userId, metadata, remaining);
    return true;
  }

  async isActive(userId: string, tokenId: string): Promise<boolean> {
    const active = await this.list(userId);
    return active.some((meta) => meta.id === tokenId);
  }

  private async readUser(userId: string): Promise<User | null> {
    const { data, error } = await this.admin.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      return null;
    }
    return data.user;
  }

  private async write(
    userId: string,
    metadata: Record<string, unknown>,
    tokens: TokenMeta[],
  ): Promise<void> {
    const next = { ...metadata, [STORAGE_KEY]: tokens };
    const { error } = await this.admin.auth.admin.updateUserById(userId, {
      app_metadata: next,
    });

    if (error) {
      console.error('Failed to persist personal access tokens:', error);
      throw ApiError.internal('Failed to persist token');
    }
  }
}
