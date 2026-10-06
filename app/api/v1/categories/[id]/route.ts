import { NextResponse } from 'next/server';
import { audit, withApi } from '@/lib/api/withApi';
import {
  deleteCategory,
  updateCategory,
} from '@/lib/cms/categoryService';
import {
  toCategoryResource,
  updateCategoryBodySchema,
} from '@/lib/cms/v1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withApi<{ id: string }>(
  async (req, ctx) => {
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
    await deleteCategory(ctx.auth.db, id);
    audit(ctx, 'category.delete', 'category', id);

    return NextResponse.json({ deleted: true, id });
  },
  { auth: 'token', scope: 'categories:write' },
);
