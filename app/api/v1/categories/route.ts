import { NextResponse } from 'next/server';
import { audit, withApi } from '@/lib/api/withApi';
import { createCategory, listCategories } from '@/lib/cms/categoryService';
import {
  createCategoryBodySchema,
  toCategoryResource,
} from '@/lib/cms/v1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApi(
  async (_req, ctx) => {
    const items = await listCategories(ctx.auth.db);
    return NextResponse.json({ items: items.map(toCategoryResource) });
  },
  { auth: 'token' },
);

export const POST = withApi(
  async (req, ctx) => {
    const body = createCategoryBodySchema.parse(await req.json());
    const category = await createCategory(ctx.auth.db, body);
    audit(ctx, 'category.create', 'category', category.id);

    return NextResponse.json(toCategoryResource(category), { status: 201 });
  },
  { auth: 'token', scope: 'categories:write' },
);
