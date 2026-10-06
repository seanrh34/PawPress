import { NextResponse } from 'next/server';
import { audit, withApi } from '@/lib/api/withApi';
import { ApiError } from '@/lib/cms/errors';
import {
  deleteCategory,
  isUuid,
  updateCategory,
} from '@/lib/cms/categoryService';
import {
  toCategoryResource,
  updateCategoryBodySchema,
} from '@/lib/cms/v1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function assertCategoryId(id: string): void {
  if (!isUuid(id)) {
    throw ApiError.notFound('Category not found');
  }
}

export const PATCH = withApi<{ id: string }>(
  async (req, ctx) => {
    assertCategoryId(ctx.params.id);
    const body = updateCategoryBodySchema.parse(await req.json());
    const category = await updateCategory(ctx.auth.db, ctx.params.id, body);
    audit(ctx, 'category.update', 'category', category.id);

    return NextResponse.json(toCategoryResource(category));
  },
  { auth: 'token', scope: 'categories:write' },
);

export const DELETE = withApi<{ id: string }>(
  async (_req, ctx) => {
    const id = ctx.params.id;
    assertCategoryId(id);
    await deleteCategory(ctx.auth.db, id);
    audit(ctx, 'category.delete', 'category', id);

    return NextResponse.json({ deleted: true, id });
  },
  { auth: 'token', scope: 'categories:write' },
);
