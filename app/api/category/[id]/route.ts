import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUser } from '@/lib/auth';
import { ApiError, toLegacyResponse } from '@/lib/cms/errors';
import {
  deleteCategory,
  getCategory,
  updateCategory,
} from '@/lib/cms/categoryService';

// Use secret key for admin operations (bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseSecretKey);

// GET - Get single category by ID
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const category = await getCategory(supabase, id);

    if (!category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(category);
  } catch (error) {
    if (error instanceof ApiError) {
      return toLegacyResponse(error);
    }
    console.error('Error in GET /api/category/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update category
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  // Check authentication
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();

    const category = await updateCategory(supabase, id, {
      name: body.name,
      slug: body.slug,
      description: body.description,
    });

    return NextResponse.json(category);
  } catch (error) {
    if (error instanceof ApiError) {
      return toLegacyResponse(error);
    }
    console.error('Error in PUT /api/category/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete category
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  // Check authentication
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    await deleteCategory(supabase, id);

    return NextResponse.json({ message: 'Category deleted successfully' });
  } catch (error) {
    if (error instanceof ApiError) {
      return toLegacyResponse(error);
    }
    console.error('Error in DELETE /api/category/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
