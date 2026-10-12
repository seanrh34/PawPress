import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import {
  parsePublishAt,
  resolveCreatePublishedAt,
  resolveUpdatePublishedAt,
  toPostResource,
} from '../v1';
import type { PostRow } from '../postService';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function row(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Hello',
    slug: 'hello',
    content_lexical: null,
    content_html: '',
    excerpt: '',
    featured_image_url: null,
    published_at: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    category_id: '11111111-1111-4111-8111-111111111111',
    category: null,
    ...overrides,
  };
}

function caught(fn: () => unknown): ApiError {
  try {
    fn();
    throw new Error('expected an ApiError');
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
}

describe('parsePublishAt', () => {
  it('accepts an explicit UTC offset', () => {
    const parsed = parsePublishAt('2026-07-01T09:00:00+08:00', 'publish_at', NOW);
    expect(parsed.toISOString()).toBe('2026-07-01T01:00:00.000Z');
  });

  it('accepts a Z suffix and fractional seconds', () => {
    const parsed = parsePublishAt('2026-07-01T01:00:00.500Z', 'publish_at', NOW);
    expect(parsed.toISOString()).toBe('2026-07-01T01:00:00.500Z');
  });

  it('rejects a timestamp without an offset', () => {
    const error = caught(() =>
      parsePublishAt('2026-07-01T09:00:00', 'publish_at', NOW),
    );
    expect(error.code).toBe('validation_failed');
    expect(error.details).toMatchObject({ fields: { publish_at: [expect.any(String)] } });
    expect(error.message).toContain('explicit offset or Z');
  });

  it('rejects an unparseable timestamp', () => {
    const error = caught(() =>
      parsePublishAt('not-a-date', 'publish_at', NOW),
    );
    expect(error.code).toBe('validation_failed');
  });

  it('rejects an impossible calendar date instead of rolling it over', () => {
    const error = caught(() =>
      parsePublishAt('2026-11-31T00:00:00Z', 'publish_at', NOW),
    );
    expect(error.code).toBe('validation_failed');
    expect(error.message).toContain('valid ISO-8601');
  });

  it('rejects T24:00:00', () => {
    const error = caught(() =>
      parsePublishAt('2026-07-01T24:00:00Z', 'publish_at', NOW),
    );
    expect(error.code).toBe('validation_failed');
  });

  it('rejects a timestamp in the past or now', () => {
    expect(caught(() => parsePublishAt('2026-05-31T23:59:59Z', 'publish_at', NOW)).message).toContain(
      'future',
    );
    expect(caught(() => parsePublishAt(NOW.toISOString(), 'publish_at', NOW)).message).toContain(
      'future',
    );
  });

  it('rejects a timestamp more than 365 days ahead', () => {
    const tooFar = new Date(NOW.getTime() + 366 * 24 * 60 * 60 * 1000).toISOString();
    expect(caught(() => parsePublishAt(tooFar, 'publish_at', NOW)).message).toContain(
      '365 days',
    );
  });

  it('names the offending field in details', () => {
    const error = caught(() => parsePublishAt('nope', 'at', NOW));
    expect(error.details).toMatchObject({ fields: { at: [expect.any(String)] } });
  });
});

describe('resolveCreatePublishedAt', () => {
  it('returns null for a draft', () => {
    expect(resolveCreatePublishedAt({}, NOW)).toBeNull();
    expect(resolveCreatePublishedAt({ status: 'draft' }, NOW)).toBeNull();
  });

  it('returns now for published', () => {
    expect(resolveCreatePublishedAt({ status: 'published' }, NOW)).toBe(
      NOW.toISOString(),
    );
  });

  it('parses publish_at for scheduled', () => {
    expect(
      resolveCreatePublishedAt(
        { status: 'scheduled', publish_at: '2026-07-01T09:00:00+08:00' },
        NOW,
      ),
    ).toBe('2026-07-01T01:00:00.000Z');
  });

  it('requires publish_at for scheduled', () => {
    const error = caught(() => resolveCreatePublishedAt({ status: 'scheduled' }, NOW));
    expect(error.code).toBe('validation_failed');
  });
});

describe('resolveUpdatePublishedAt', () => {
  it('leaves published_at untouched when no status or publish_at is sent', () => {
    expect(resolveUpdatePublishedAt({}, { published_at: null }, NOW)).toBeUndefined();
    expect(
      resolveUpdatePublishedAt({}, { published_at: '2020-01-01T00:00:00.000Z' }, NOW),
    ).toBeUndefined();
  });

  it('clears published_at for a draft', () => {
    expect(
      resolveUpdatePublishedAt(
        { status: 'draft' },
        { published_at: '2020-01-01T00:00:00.000Z' },
        NOW,
      ),
    ).toBeNull();
  });

  it('keeps a past published_at when publishing', () => {
    expect(
      resolveUpdatePublishedAt(
        { status: 'published' },
        { published_at: '2020-01-01T00:00:00.000Z' },
        NOW,
      ),
    ).toBe('2020-01-01T00:00:00.000Z');
  });

  it('sets now when publishing an unpublished post', () => {
    expect(resolveUpdatePublishedAt({ status: 'published' }, { published_at: null }, NOW)).toBe(
      NOW.toISOString(),
    );
  });

  it('replaces a future published_at with now when publishing', () => {
    expect(
      resolveUpdatePublishedAt(
        { status: 'published' },
        { published_at: '2999-01-01T00:00:00.000Z' },
        NOW,
      ),
    ).toBe(NOW.toISOString());
  });

  it('schedules with publish_at', () => {
    expect(
      resolveUpdatePublishedAt(
        { status: 'scheduled', publish_at: '2026-07-01T09:00:00+08:00' },
        { published_at: null },
        NOW,
      ),
    ).toBe('2026-07-01T01:00:00.000Z');
  });

  it('requires publish_at when scheduling', () => {
    const error = caught(() =>
      resolveUpdatePublishedAt({ status: 'scheduled' }, { published_at: null }, NOW),
    );
    expect(error.code).toBe('validation_failed');
    expect(error.details).toMatchObject({ fields: { publish_at: [expect.any(String)] } });
  });

  it('allows a bare publish_at to reschedule a scheduled post', () => {
    expect(
      resolveUpdatePublishedAt(
        { publish_at: '2026-08-01T09:00:00+08:00' },
        { published_at: '2026-07-01T00:00:00.000Z' },
        NOW,
      ),
    ).toBe('2026-08-01T01:00:00.000Z');
  });

  it('rejects a bare publish_at on a non-scheduled post with a hint', () => {
    const error = caught(() =>
      resolveUpdatePublishedAt(
        { publish_at: '2026-08-01T09:00:00+08:00' },
        { published_at: null },
        NOW,
      ),
    );
    expect(error.code).toBe('validation_failed');
    expect(error.message).toContain('status');
  });
});

describe('toPostResource status', () => {
  it('derives draft, scheduled and published', () => {
    expect(toPostResource(row({ published_at: null })).status).toBe('draft');
    expect(
      toPostResource(row({ published_at: '2999-01-01T00:00:00.000Z' })).status,
    ).toBe('scheduled');
    expect(
      toPostResource(row({ published_at: '2020-01-01T00:00:00.000Z' })).status,
    ).toBe('published');
  });
});
