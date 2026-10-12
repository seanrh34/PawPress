import { describe, expect, it } from 'vitest';
import { restCompare, restEq, restFilter } from '../supabaseRest';

describe('restFilter', () => {
  it('prefixes the operator and percent-encodes the value', () => {
    expect(restFilter('eq', 'news')).toBe('eq.news');
    expect(restFilter('eq', 'a b/c')).toBe('eq.a%20b%2Fc');
  });

  it('escapes characters that could inject query syntax', () => {
    expect(restFilter('eq', 'x&select=*')).toBe('eq.x%26select%3D*');
    expect(restFilter('lte', '2026-01-01T00:00:00.000Z')).toBe(
      'lte.2026-01-01T00%3A00%3A00.000Z',
    );
  });
});

describe('restEq', () => {
  it('builds a single equality filter pair', () => {
    expect(restEq('slug', 'my post')).toBe('slug=eq.my%20post');
  });
});

describe('restCompare', () => {
  it('builds a range filter pair', () => {
    expect(restCompare('published_at', 'lte', '2026-01-01T00:00:00Z')).toBe(
      'published_at=lte.2026-01-01T00%3A00%3A00Z',
    );
  });
});
