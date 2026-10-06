import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ApiError, fromZodError, isUniqueViolation } from './errors';
import { MAX_SLUG_LENGTH, validateSlug } from './slug';

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

const CATEGORY_NAME = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name must be at most 100 characters');

const CATEGORY_SLUG = z
  .string()
  .min(1, 'Slug is required')
  .max(MAX_SLUG_LENGTH, `Slug must be at most ${MAX_SLUG_LENGTH} characters`);

const CATEGORY_DESCRIPTION = z
  .string()
  .min(1, 'Description is required')
  .max(1000, 'Description must be at most 1000 characters');

const createCategorySchema = z.object({
  name: CATEGORY_NAME,
  slug: CATEGORY_SLUG,
  description: CATEGORY_DESCRIPTION,
});

const updateCategorySchema = z.object({
  name: CATEGORY_NAME.optional(),
  slug: CATEGORY_SLUG.optional(),
  description: CATEGORY_DESCRIPTION.optional(),
});

export interface CategoryInput {
  name: string;
  slug: string;
  description: string;
}

export type CategoryPatch = Partial<CategoryInput>;

function assertValidSlug(slug: string): void {
  const message = validateSlug(slug);
  if (message) {
    throw ApiError.validation(message, { fields: { slug: [message] } });
  }
}

export async function listCategories(db: SupabaseClient): Promise<CategoryRow[]> {
  const { data, error } = await db
    .from('categories')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to fetch categories:', error);
    throw ApiError.internal();
  }

  return (data ?? []) as CategoryRow[];
}

export async function getCategory(
  db: SupabaseClient,
  id: string,
): Promise<CategoryRow | null> {
  const { data, error } = await db
    .from('categories')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch category:', error);
    throw ApiError.internal();
  }

  return (data as CategoryRow | null) ?? null;
}

export async function resolveCategory(
  db: SupabaseClient,
  idOrSlug: string,
): Promise<CategoryRow | null> {
  if (isUuid(idOrSlug)) {
    return getCategory(db, idOrSlug);
  }

  const { data, error } = await db
    .from('categories')
    .select('*')
    .eq('slug', idOrSlug)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch category:', error);
    throw ApiError.internal();
  }

  return (data as CategoryRow | null) ?? null;
}

export async function createCategory(
  db: SupabaseClient,
  input: CategoryInput,
): Promise<CategoryRow> {
  if (!input.name || !input.slug || !input.description) {
    throw ApiError.validation('Name, slug, and description are required', {
      fields: {
        name: input.name ? [] : ['Name is required'],
        slug: input.slug ? [] : ['Slug is required'],
        description: input.description ? [] : ['Description is required'],
      },
    });
  }

  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) {
    throw fromZodError(parsed.error);
  }

  assertValidSlug(parsed.data.slug);

  const { data, error } = await db
    .from('categories')
    .insert([
      {
        name: parsed.data.name,
        slug: parsed.data.slug,
        description: parsed.data.description,
      },
    ])
    .select()
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      throw ApiError.conflict('A category with this slug already exists');
    }
    console.error('Failed to create category:', error);
    throw ApiError.internal();
  }

  return data as CategoryRow;
}

export async function updateCategory(
  db: SupabaseClient,
  id: string,
  patch: CategoryPatch,
): Promise<CategoryRow> {
  const parsed = updateCategorySchema.safeParse(patch);
  if (!parsed.success) {
    throw fromZodError(parsed.error);
  }

  if (parsed.data.slug !== undefined) {
    assertValidSlug(parsed.data.slug);
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.slug !== undefined) update.slug = parsed.data.slug;
  if (parsed.data.description !== undefined) {
    update.description = parsed.data.description;
  }

  if (Object.keys(update).length === 0) {
    const existing = await getCategory(db, id);
    if (!existing) {
      throw ApiError.notFound('Category not found');
    }
    return existing;
  }

  const { data, error } = await db
    .from('categories')
    .update(update)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      throw ApiError.conflict('A category with this slug already exists');
    }
    console.error('Failed to update category:', error);
    throw ApiError.internal();
  }

  if (!data) {
    throw ApiError.notFound('Category not found');
  }

  return data as CategoryRow;
}

export async function deleteCategory(
  db: SupabaseClient,
  id: string,
): Promise<void> {
  const existing = await getCategory(db, id);
  if (!existing) {
    throw ApiError.notFound('Category not found');
  }

  const { data: posts, error: postsError } = await db
    .from('posts')
    .select('id')
    .eq('category_id', id)
    .limit(1);

  if (postsError) {
    console.error('Failed to check category usage:', postsError);
    throw ApiError.internal();
  }

  if (Array.isArray(posts) && posts.length > 0) {
    throw ApiError.conflict(
      'Cannot delete category that has posts. Please reassign or delete the posts first.',
    );
  }

  const { error } = await db.from('categories').delete().eq('id', id);

  if (error) {
    console.error('Failed to delete category:', error);
    throw ApiError.internal();
  }
}
