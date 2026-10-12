import { describe, expect, it } from 'vitest';
import {
  MAX_SLUG_LENGTH,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  slugify,
  validateSlug,
} from '../slug';

describe('RESERVED_SLUGS', () => {
  it('is the union of the old post and category lists', () => {
    expect([...RESERVED_SLUGS]).toEqual([
      'admin',
      'api',
      'category',
      'posts',
      'styles',
    ]);
  });
});

describe('SLUG_PATTERN', () => {
  it('accepts lowercase alphanumeric words separated by single dashes', () => {
    expect(SLUG_PATTERN.test('hello-world-2')).toBe(true);
  });

  it('rejects uppercase, leading/trailing dashes and repeats', () => {
    expect(SLUG_PATTERN.test('Hello')).toBe(false);
    expect(SLUG_PATTERN.test('-hello')).toBe(false);
    expect(SLUG_PATTERN.test('hello-')).toBe(false);
    expect(SLUG_PATTERN.test('hello--world')).toBe(false);
    expect(SLUG_PATTERN.test('hello_world')).toBe(false);
  });
});

describe('slugify', () => {
  it('lowercases and replaces non-alphanumerics with single dashes', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('strips diacritics', () => {
    expect(slugify('Café Déjà Vü')).toBe('cafe-deja-vu');
  });

  it('collapses runs of separators and trims dashes', () => {
    expect(slugify('  --Multiple   spaces--  ')).toBe('multiple-spaces');
  });

  it('returns an empty string when nothing usable remains', () => {
    expect(slugify('')).toBe('');
    expect(slugify('!!!')).toBe('');
    expect(slugify('日本語')).toBe('');
  });

  it('caps the result at the maximum length without a trailing dash', () => {
    const result = slugify(`${'a'.repeat(199)}-${'b'.repeat(50)}`);
    expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(result.endsWith('-')).toBe(false);
    expect(SLUG_PATTERN.test(result)).toBe(true);
  });
});

describe('validateSlug', () => {
  it('returns null for a valid slug', () => {
    expect(validateSlug('my-post-1')).toBeNull();
  });

  it('rejects empty slugs', () => {
    expect(validateSlug('')).not.toBeNull();
  });

  it('rejects slugs over the maximum length', () => {
    expect(validateSlug('a'.repeat(MAX_SLUG_LENGTH + 1))).toContain('200');
  });

  it('rejects invalid characters and shapes', () => {
    expect(validateSlug('Not-Lower')).toContain('lowercase');
    expect(validateSlug('has_underscore')).toContain('lowercase');
    expect(validateSlug('two--dashes')).toContain('lowercase');
  });

  it('rejects reserved slugs case-insensitively', () => {
    expect(validateSlug('admin')).toContain('reserved');
    expect(validateSlug('API')).toContain('reserved');
    expect(validateSlug('posts')).toContain('reserved');
    expect(validateSlug('styles')).toContain('reserved');
  });
});
