import { describe, expect, it } from 'vitest';
import { postStatus } from '../status';

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

  it('treats an unparseable timestamp as published', () => {
    expect(postStatus('not-a-date', NOW)).toBe('published');
  });
});
