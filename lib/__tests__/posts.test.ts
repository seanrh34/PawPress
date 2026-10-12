import { describe, expect, it, vi } from 'vitest';
import { getAllPosts, getPostBySlug, isPubliclyVisible } from '../posts';

const holder = vi.hoisted(() => ({ anon: undefined as unknown }));

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return holder.anon;
  },
}));

interface RecordedQuery {
  method: string;
  args: unknown[];
}

function makeClient(result: { data: unknown; error: unknown }): {
  client: unknown;
  calls: RecordedQuery[];
} {
  const calls: RecordedQuery[] = [];
  function chain() {
    const query: Record<string, unknown> = {};
    for (const method of [
      'select',
      'eq',
      'not',
      'ilike',
      'gt',
      'gte',
      'lt',
      'lte',
      'order',
      'range',
      'limit',
    ]) {
      query[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return query;
      };
    }
    query.single = async () => ({ data: result.data, error: result.error });
    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected);
    return query;
  }
  return { client: { from: () => chain() }, calls };
}

describe('isPubliclyVisible', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');

  it('hides drafts', () => {
    expect(isPubliclyVisible({ published_at: null }, now)).toBe(false);
  });

  it('hides scheduled posts', () => {
    expect(
      isPubliclyVisible({ published_at: '2026-06-01T00:00:01.000Z' }, now),
    ).toBe(false);
  });

  it('shows published posts', () => {
    expect(
      isPubliclyVisible({ published_at: '2026-05-31T23:59:59.000Z' }, now),
    ).toBe(true);
  });

  it('shows a post published exactly now', () => {
    expect(isPubliclyVisible({ published_at: now.toISOString() }, now)).toBe(true);
  });

  it('treats an unparseable timestamp as visible, matching postStatus', () => {
    expect(isPubliclyVisible({ published_at: 'nonsense' }, now)).toBe(true);
  });
});

describe('getAllPosts', () => {
  it('filters to posts with published_at <= now', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    try {
      const { client, calls } = makeClient({ data: [], error: null });
      holder.anon = client;

      await getAllPosts();

      expect(calls.find((call) => call.method === 'not')?.args).toEqual([
        'published_at',
        'is',
        null,
      ]);
      expect(calls.find((call) => call.method === 'lte')?.args).toEqual([
        'published_at',
        '2026-06-01T00:00:00.000Z',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getPostBySlug', () => {
  it('filters to live posts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    try {
      const { client, calls } = makeClient({ data: null, error: { message: 'no rows' } });
      holder.anon = client;

      const result = await getPostBySlug('hello');

      expect(result).toBeNull();
      expect(calls.find((call) => call.method === 'eq')?.args).toEqual([
        'slug',
        'hello',
      ]);
      expect(calls.find((call) => call.method === 'lte')?.args).toEqual([
        'published_at',
        '2026-06-01T00:00:00.000Z',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
