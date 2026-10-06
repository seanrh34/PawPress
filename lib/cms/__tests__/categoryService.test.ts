import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors';
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  resolveCategory,
  updateCategory,
  type CategoryRow,
} from '../categoryService';
import { makeDb } from './fakeDb';

const UUID = '11111111-1111-4111-8111-111111111111';

const row: CategoryRow = {
  id: UUID,
  name: 'News',
  slug: 'news',
  description: 'The news',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('listCategories', () => {
  it('returns rows ordered by name', async () => {
    const db = makeDb({ categories: [{ data: [row], error: null }] });
    await expect(listCategories(db.client)).resolves.toEqual([row]);
    expect(db.callsFor('categories', 'order')[0].args).toEqual([
      'name',
      { ascending: true },
    ]);
  });

  it('throws internal on database errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = makeDb({ categories: [{ error: { message: 'boom' } }] });
    await expect(listCategories(db.client)).rejects.toMatchObject({
      code: 'internal',
    });
  });
});

describe('getCategory', () => {
  it('returns null when missing', async () => {
    const db = makeDb({ categories: [{ data: null }] });
    await expect(getCategory(db.client, UUID)).resolves.toBeNull();
  });

  it('returns the row when found', async () => {
    const db = makeDb({ categories: [{ data: row }] });
    await expect(getCategory(db.client, UUID)).resolves.toEqual(row);
  });
});

describe('resolveCategory', () => {
  it('looks up by id for a UUID', async () => {
    const db = makeDb({ categories: [{ data: row }] });
    await resolveCategory(db.client, UUID);
    expect(db.callsFor('categories', 'eq')[0].args).toEqual(['id', UUID]);
  });

  it('looks up by slug otherwise', async () => {
    const db = makeDb({ categories: [{ data: row }] });
    await resolveCategory(db.client, 'news');
    expect(db.callsFor('categories', 'eq')[0].args).toEqual(['slug', 'news']);
  });
});

describe('createCategory', () => {
  it('inserts a valid category', async () => {
    const db = makeDb({ categories: [{ data: row, error: null }] });
    const result = await createCategory(db.client, {
      name: 'News',
      slug: 'news',
      description: 'The news',
    });
    expect(result).toEqual(row);
    expect(db.callsFor('categories', 'insert')[0].args[0]).toEqual([
      { name: 'News', slug: 'news', description: 'The news' },
    ]);
  });

  it('rejects missing required fields with the legacy message', async () => {
    const db = makeDb();
    await expect(
      createCategory(db.client, { name: '', slug: '', description: '' }),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      message: 'Name, slug, and description are required',
    });
  });

  it('rejects malformed slugs', async () => {
    const db = makeDb();
    await expect(
      createCategory(db.client, {
        name: 'News',
        slug: 'Not Valid',
        description: 'd',
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('rejects the newly reserved posts/styles slugs', async () => {
    const db = makeDb();
    await expect(
      createCategory(db.client, {
        name: 'Posts',
        slug: 'posts',
        description: 'd',
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('maps a unique violation to conflict', async () => {
    const db = makeDb({ categories: [{ error: { code: '23505' } }] });
    const error = await createCategory(db.client, {
      name: 'News',
      slug: 'news',
      description: 'd',
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('conflict');
  });
});

describe('updateCategory', () => {
  it('only writes the provided fields', async () => {
    const db = makeDb({ categories: [{ data: row, error: null }] });
    const result = await updateCategory(db.client, UUID, { name: 'Renamed' });
    expect(result).toEqual(row);
    expect(db.callsFor('categories', 'update')[0].args[0]).toEqual({
      name: 'Renamed',
    });
  });

  it('validates a provided slug before writing', async () => {
    const db = makeDb();
    await expect(
      updateCategory(db.client, UUID, { slug: 'posts' }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(db.callsFor('categories', 'update')).toHaveLength(0);
  });

  it('maps a unique violation to conflict', async () => {
    const db = makeDb({ categories: [{ error: { code: '23505' } }] });
    await expect(
      updateCategory(db.client, UUID, { slug: 'other' }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('returns not_found when the category does not exist', async () => {
    const db = makeDb({ categories: [{ data: null }] });
    await expect(
      updateCategory(db.client, UUID, { name: 'Renamed' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('deleteCategory', () => {
  it('deletes an unused category', async () => {
    const db = makeDb({
      categories: [{ data: row }],
      posts: [{ data: [] }],
    });
    await expect(deleteCategory(db.client, UUID)).resolves.toBeUndefined();
    expect(db.callsFor('categories', 'delete')).toHaveLength(1);
  });

  it('conflicts when posts still reference the category', async () => {
    const db = makeDb({
      categories: [{ data: row }],
      posts: [{ data: [{ id: 'p1' }] }],
    });
    await expect(deleteCategory(db.client, UUID)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(db.callsFor('categories', 'delete')).toHaveLength(0);
  });

  it('returns not_found when missing', async () => {
    const db = makeDb({ categories: [{ data: null }] });
    await expect(deleteCategory(db.client, UUID)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
