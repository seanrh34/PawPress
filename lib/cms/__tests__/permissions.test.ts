import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import {
  ALL_SCOPES,
  DEFAULT_TOKEN_SCOPES,
  ROLE_SCOPES,
  assertScope,
  effectiveScopes,
  isRole,
  isScope,
  requiredScopesForPostCreate,
  requiredScopesForPostUpdate,
  type Role,
  type Scope,
} from '../permissions';

describe('scope and role guards', () => {
  it('exposes all six scopes', () => {
    expect(ALL_SCOPES).toHaveLength(6);
    expect(isScope('posts:publish')).toBe(true);
    expect(isScope('users:read')).toBe(false);
    expect(isScope(42)).toBe(false);
  });

  it('recognises roles', () => {
    expect(isRole('master')).toBe(true);
    expect(isRole('admin')).toBe(true);
    expect(isRole('viewer')).toBe(false);
  });

  it('gives both roles every scope', () => {
    expect([...ROLE_SCOPES.master]).toEqual([...ALL_SCOPES]);
    expect([...ROLE_SCOPES.admin]).toEqual([...ALL_SCOPES]);
  });

  it('defaults agent tokens to draft-only scopes', () => {
    expect([...DEFAULT_TOKEN_SCOPES]).toEqual([
      'posts:read',
      'posts:write',
      'media:upload',
    ]);
  });
});

describe('effectiveScopes', () => {
  it('intersects token scopes with the role scopes in canonical order', () => {
    expect(
      effectiveScopes(['media:upload', 'posts:read'], 'master'),
    ).toEqual(['posts:read', 'media:upload']);
  });

  it('ignores scopes the role does not grant', () => {
    expect(
      effectiveScopes(['posts:read', 'bogus' as Scope], 'admin'),
    ).toEqual(['posts:read']);
  });

  it('returns nothing for an unknown role', () => {
    expect(effectiveScopes(['posts:read'], 'viewer' as Role)).toEqual([]);
  });
});

describe('assertScope', () => {
  it('passes when the scope is present', () => {
    expect(() =>
      assertScope({ scopes: ['posts:read'] }, 'posts:read'),
    ).not.toThrow();
  });

  it('throws a forbidden ApiError naming the missing scope', () => {
    try {
      assertScope({ scopes: ['posts:read'] }, 'posts:publish');
      throw new Error('expected assertScope to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe('forbidden');
      expect(apiError.status).toBe(403);
      expect(apiError.message).toContain('posts:publish');
    }
  });
});

describe('requiredScopesForPostUpdate', () => {
  const draft = { published_at: null };
  const published = { published_at: '2026-01-01T00:00:00.000Z' };

  it('needs only posts:write for a plain draft edit', () => {
    expect(requiredScopesForPostUpdate(draft, {})).toEqual(['posts:write']);
  });

  it('does not require publish when status is unchanged draft', () => {
    expect(requiredScopesForPostUpdate(draft, { status: 'draft' })).toEqual([
      'posts:write',
    ]);
  });

  it('requires publish when turning a draft into published', () => {
    expect(
      requiredScopesForPostUpdate(draft, { status: 'published' }),
    ).toEqual(['posts:write', 'posts:publish']);
  });

  it('always requires publish when editing a published post', () => {
    expect(requiredScopesForPostUpdate(published, {})).toEqual([
      'posts:write',
      'posts:publish',
    ]);
    expect(
      requiredScopesForPostUpdate(published, { status: 'published' }),
    ).toEqual(['posts:write', 'posts:publish']);
  });

  it('requires publish when unpublishing a published post', () => {
    expect(
      requiredScopesForPostUpdate(published, { status: 'draft' }),
    ).toEqual(['posts:write', 'posts:publish']);
  });
});

describe('requiredScopesForPostCreate', () => {
  it('needs only posts:write for drafts', () => {
    expect(requiredScopesForPostCreate({})).toEqual(['posts:write']);
    expect(requiredScopesForPostCreate({ status: 'draft' })).toEqual([
      'posts:write',
    ]);
  });

  it('adds posts:publish when created published', () => {
    expect(requiredScopesForPostCreate({ status: 'published' })).toEqual([
      'posts:write',
      'posts:publish',
    ]);
  });
});
