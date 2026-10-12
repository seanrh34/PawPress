import { describe, expect, it } from 'vitest';
import { isPubliclyVisible, postStatus } from '../status';

const NOW = new Date('2026-06-01T00:00:00.000Z');

describe('postStatus', () => {
  it('is draft when published_at is null', () => {
    expect(postStatus(null, NOW)).toBe('draft');
  });

  it('is scheduled for a timestamp in the future', () => {
    expect(postStatus('2026-06-01T00:00:01.000Z', NOW)).toBe('scheduled');
  });

  it('is published for a timestamp in the past', () => {
    expect(postStatus('2026-05-31T23:59:59.000Z', NOW)).toBe('published');
  });

  it('is published for a timestamp equal to now', () => {
    expect(postStatus(NOW.toISOString(), NOW)).toBe('published');
  });

  it('fails closed on an unparseable timestamp', () => {
    expect(postStatus('not-a-date', NOW)).toBe('draft');
  });

  it('fails closed on undefined, non-string and empty values', () => {
    expect(postStatus(undefined, NOW)).toBe('draft');
    expect(postStatus('', NOW)).toBe('draft');
    expect(postStatus(1700000000000, NOW)).toBe('draft');
    expect(postStatus({}, NOW)).toBe('draft');
    expect(postStatus(true, NOW)).toBe('draft');
  });
});

describe('isPubliclyVisible', () => {
  it('is false for drafts, scheduled and malformed timestamps', () => {
    expect(isPubliclyVisible({ published_at: null }, NOW)).toBe(false);
    expect(isPubliclyVisible({ published_at: undefined }, NOW)).toBe(false);
    expect(
      isPubliclyVisible({ published_at: '2026-06-01T00:00:01.000Z' }, NOW),
    ).toBe(false);
    expect(isPubliclyVisible({ published_at: 'not-a-date' }, NOW)).toBe(false);
    expect(isPubliclyVisible({ published_at: 123 }, NOW)).toBe(false);
  });

  it('is true only for a past timestamp', () => {
    expect(
      isPubliclyVisible({ published_at: '2026-05-31T23:59:59.000Z' }, NOW),
    ).toBe(true);
  });
});
