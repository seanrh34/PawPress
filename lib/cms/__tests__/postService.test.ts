import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SerializedEditorState } from 'lexical';
import { ApiError } from '../errors';
import { makeDb } from './fakeDb';

const { lexicalToHtmlMock } = vi.hoisted(() => ({
  lexicalToHtmlMock: vi.fn(),
}));

vi.mock('@/lib/lexicalToHtml', () => ({
  lexicalToHtml: lexicalToHtmlMock,
}));

import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  publishPost,
  unpublishPost,
  updatePost,
} from '../postService';
import type { CategoryRow } from '../categoryService';
import type { PostRow } from '../postService';

const UUID = '22222222-2222-4222-8222-222222222222';

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-01T00:00:01.000Z';
const T2 = '2026-01-01T00:00:02.000Z';

const category: CategoryRow = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'News',
  slug: 'news',
  description: 'The news',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const post: PostRow = {
  id: UUID,
  title: 'Hello',
  slug: 'hello',
  content_lexical: null,
  content_html: '',
  excerpt: '',
  featured_image_url: null,
  published_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  category_id: category.id,
};

const lexicalState = {
  root: { type: 'root', children: [] },
} as unknown as SerializedEditorState;

beforeEach(() => {
  lexicalToHtmlMock.mockReset();
  lexicalToHtmlMock.mockResolvedValue('<p>ok</p>');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function updatePayload(
  db: ReturnType<typeof makeDb>,
): Record<string, unknown> {
  return db.callsFor('posts', 'update')[0].args[0] as Record<string, unknown>;
}

function updateEqFilters(db: ReturnType<typeof makeDb>): unknown[][] {
  const start = db.calls.findIndex(
    (call) => call.table === 'posts' && call.method === 'update',
  );
  const end = db.calls.findIndex(
    (call, index) => index > start && call.method === 'select',
  );
  return db.calls
    .slice(start, end === -1 ? undefined : end)
    .filter((call) => call.method === 'eq')
    .map((call) => call.args);
}

describe('createPost', () => {
  it('derives the slug and defaults empty fields', async () => {
    const db = makeDb({
      categories: [{ data: category }],
      posts: [{ data: post }],
    });

    const result = await createPost(db.client, {
      title: 'Hello World',
      category_id: category.id,
    });
    expect(result).toEqual(post);

    const inserted = db.callsFor('posts', 'insert')[0].args[0] as Array<
      Record<string, unknown>
    >;
    expect(inserted[0]).toMatchObject({
      title: 'Hello World',
      slug: 'hello-world',
      content_lexical: null,
      content_html: '',
      excerpt: '',
      featured_image_url: null,
      published_at: null,
      category_id: category.id,
    });
  });

  it('converts content to HTML when provided', async () => {
    const db = makeDb({
      categories: [{ data: category }],
      posts: [{ data: post }],
    });

    await createPost(db.client, {
      title: 'Hello',
      slug: 'hello',
      category_id: category.id,
      content_lexical: lexicalState,
    });

    expect(lexicalToHtmlMock).toHaveBeenCalledWith(lexicalState);
    const inserted = db.callsFor('posts', 'insert')[0].args[0] as Array<
      Record<string, unknown>
    >;
    expect(inserted[0].content_html).toBe('<p>ok</p>');
  });

  it('rejects a reserved derived slug', async () => {
    const db = makeDb();
    await expect(
      createPost(db.client, { title: 'Admin', category_id: category.id }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('rejects an unknown category', async () => {
    const db = makeDb({ categories: [{ data: null }] });
    await expect(
      createPost(db.client, {
        title: 'Hello',
        slug: 'hello',
        category_id: category.id,
      }),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      message: 'Invalid category',
    });
  });

  it('maps a unique violation to conflict', async () => {
    const db = makeDb({
      categories: [{ data: category }],
      posts: [{ error: { code: '23505' } }],
    });
    await expect(
      createPost(db.client, {
        title: 'Hello',
        slug: 'hello',
        category_id: category.id,
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('throws internal when HTML conversion fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    lexicalToHtmlMock.mockRejectedValue(new Error('bad content'));

    const db = makeDb({
      categories: [{ data: category }],
      posts: [{ data: post }],
    });

    const error = await createPost(db.client, {
      title: 'Hello',
      slug: 'hello',
      category_id: category.id,
      content_lexical: lexicalState,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('internal');
    expect((error as ApiError).message).toBe(
      'Failed to convert content to HTML. Please try again.',
    );
    expect(db.callsFor('posts', 'insert')).toHaveLength(0);
  });
});

describe('updatePost', () => {
  it('conflicts on if_updated_at mismatch and writes nothing', async () => {
    const db = makeDb({
      posts: [{ data: { ...post, updated_at: T1 } }],
    });

    await expect(
      updatePost(
        db.client,
        UUID,
        { title: 'New' },
        { ifUpdatedAt: T0 },
      ),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { current_updated_at: T1 },
    });
    expect(db.callsFor('posts', 'update')).toHaveLength(0);
  });

  it('rejects an unparseable if_updated_at before any write', async () => {
    const db = makeDb();

    await expect(
      updatePost(db.client, UUID, { title: 'New' }, { ifUpdatedAt: 'not-a-date' }),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      details: { fields: { if_updated_at: ['Must be a valid ISO timestamp'] } },
    });
    expect(db.callsFor('posts', 'maybeSingle')).toHaveLength(0);
    expect(db.callsFor('posts', 'update')).toHaveLength(0);
  });

  it('conflicts when the conditional update matches no row (concurrent write)', async () => {
    const db = makeDb({
      posts: [
        { data: { ...post, updated_at: T1 } },
        { data: null },
        { data: { ...post, updated_at: T2 } },
      ],
    });

    await expect(
      updatePost(db.client, UUID, { title: 'New' }, { ifUpdatedAt: T1 }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { current_updated_at: T2 },
    });

    expect(updateEqFilters(db)).toEqual([
      ['id', UUID],
      ['updated_at', T1],
    ]);
  });

  it('returns not_found when the row disappears during a conditional update', async () => {
    const db = makeDb({
      posts: [
        { data: { ...post, updated_at: T1 } },
        { data: null },
        { data: null },
      ],
    });

    await expect(
      updatePost(db.client, UUID, { title: 'New' }, { ifUpdatedAt: T1 }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('adds the updated_at filter only when if_updated_at is given', async () => {
    const withGuard = makeDb({
      posts: [
        { data: { ...post, updated_at: T1 } },
        { data: post },
      ],
    });
    await updatePost(withGuard.client, UUID, { title: 'New' }, {
      ifUpdatedAt: T1,
    });
    expect(updateEqFilters(withGuard)).toEqual([
      ['id', UUID],
      ['updated_at', T1],
    ]);

    const withoutGuard = makeDb({
      posts: [{ data: { ...post, updated_at: T1 } }, { data: post }],
    });
    await updatePost(withoutGuard.client, UUID, { title: 'New' });
    expect(updateEqFilters(withoutGuard)).toEqual([['id', UUID]]);
  });

  it('does not touch content when content is absent from the patch', async () => {
    const db = makeDb({
      posts: [
        { data: { ...post, updated_at: T1 } },
        { data: { ...post, title: 'New' } },
      ],
    });

    await updatePost(db.client, UUID, { title: 'New' });

    const payload = updatePayload(db);
    expect(payload.title).toBe('New');
    expect('content_html' in payload).toBe(false);
    expect('content_lexical' in payload).toBe(false);
    expect(typeof payload.updated_at).toBe('string');
  });

  it('regenerates content_html when content is provided', async () => {
    const db = makeDb({
      posts: [
        { data: { ...post, updated_at: T1 } },
        { data: { ...post, content_html: '<p>ok</p>' } },
      ],
    });

    await updatePost(db.client, UUID, { content_lexical: lexicalState });

    const payload = updatePayload(db);
    expect(payload.content_lexical).toEqual(lexicalState);
    expect(payload.content_html).toBe('<p>ok</p>');
  });

  it('leaves content_html unchanged when conversion fails but still saves content', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    lexicalToHtmlMock.mockRejectedValue(new Error('bad content'));

    const db = makeDb({
      posts: [
        { data: { ...post, updated_at: T1 } },
        { data: post },
      ],
    });

    await updatePost(db.client, UUID, { content_lexical: lexicalState });

    const payload = updatePayload(db);
    expect('content_html' in payload).toBe(false);
    expect(payload.content_lexical).toEqual(lexicalState);
  });

  it('returns not_found for a missing post', async () => {
    const db = makeDb({ posts: [{ data: null }] });
    await expect(
      updatePost(db.client, UUID, { title: 'New' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('fails with internal and writes nothing when strictHtml conversion fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    lexicalToHtmlMock.mockRejectedValue(new Error('bad content'));

    const db = makeDb({
      posts: [
        { data: { ...post, updated_at: T1 } },
        { data: post },
      ],
    });

    const error = await updatePost(
      db.client,
      UUID,
      { content_lexical: lexicalState },
      { strictHtml: true },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('internal');
    expect(db.callsFor('posts', 'update')).toHaveLength(0);
  });
});

describe('publishPost', () => {
  it('keeps an existing published_at', async () => {
    const db = makeDb({
      posts: [
        { data: { ...post, published_at: '2020-01-01T00:00:00.000Z' } },
        { data: post },
      ],
    });

    await publishPost(db.client, UUID);

    expect(updatePayload(db).published_at).toBe('2020-01-01T00:00:00.000Z');
  });

  it('sets published_at when previously a draft', async () => {
    const db = makeDb({
      posts: [{ data: { ...post, published_at: null } }, { data: post }],
    });

    await publishPost(db.client, UUID);

    expect(typeof updatePayload(db).published_at).toBe('string');
  });

  it('returns not_found when missing', async () => {
    const db = makeDb({ posts: [{ data: null }] });
    await expect(publishPost(db.client, UUID)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('unpublishPost', () => {
  it('clears published_at', async () => {
    const db = makeDb({
      posts: [
        { data: { ...post, published_at: '2020-01-01T00:00:00.000Z' } },
        { data: post },
      ],
    });

    await unpublishPost(db.client, UUID);
    expect(updatePayload(db).published_at).toBeNull();
  });
});

describe('deletePost', () => {
  it('deletes an existing post', async () => {
    const db = makeDb({ posts: [{ data: post }] });
    await expect(deletePost(db.client, UUID)).resolves.toBeUndefined();
    expect(db.callsFor('posts', 'delete')).toHaveLength(1);
  });

  it('returns not_found when missing', async () => {
    const db = makeDb({ posts: [{ data: null }] });
    await expect(deletePost(db.client, UUID)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('getPost', () => {
  it('looks up by id for a UUID', async () => {
    const db = makeDb({ posts: [{ data: post }] });
    await getPost(db.client, UUID);
    expect(db.callsFor('posts', 'eq')[0].args).toEqual(['id', UUID]);
  });

  it('looks up by slug otherwise', async () => {
    const db = makeDb({ posts: [{ data: post }] });
    await getPost(db.client, 'hello');
    expect(db.callsFor('posts', 'eq')[0].args).toEqual(['slug', 'hello']);
  });
});

describe('listPosts', () => {
  it('returns an empty result for an unknown category slug', async () => {
    const db = makeDb({ categories: [{ data: null }] });
    await expect(
      listPosts(db.client, { categorySlug: 'nope' }),
    ).resolves.toEqual({ items: [], total: 0 });
    expect(db.callsFor('posts', 'select')).toHaveLength(0);
  });

  it('orders by updated_at and applies filters, limit and offset', async () => {
    const db = makeDb({ posts: [{ data: [post], count: 1 }] });

    const result = await listPosts(db.client, {
      status: 'published',
      limit: 10,
      offset: 5,
    });

    expect(result).toEqual({ items: [post], total: 1 });
    expect(db.callsFor('posts', 'select')[0].args[1]).toEqual({
      count: 'exact',
    });
    expect(db.callsFor('posts', 'not')[0].args).toEqual([
      'published_at',
      'is',
      null,
    ]);
    expect(db.callsFor('posts', 'order')[0].args[0]).toBe('updated_at');
    expect(db.callsFor('posts', 'range')[0].args).toEqual([5, 14]);
  });

  it('escapes like wildcards in the search term', async () => {
    const db = makeDb({ posts: [{ data: [], count: 0 }] });
    await listPosts(db.client, { q: 'a%b_c' });
    expect(db.callsFor('posts', 'ilike')[0].args).toEqual([
      'title',
      '%a\\%b\\_c%',
    ]);
  });

  it('filters drafts', async () => {
    const db = makeDb({ posts: [{ data: [], count: 0 }] });
    await listPosts(db.client, { status: 'draft' });
    expect(db.callsFor('posts', 'is')[0].args).toEqual(['published_at', null]);
  });
});
