import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUser } from '@/lib/auth';
import { ApiError, toLegacyResponse } from '@/lib/cms/errors';
import { createCategory, listCategories } from '@/lib/cms/categoryService';

// Use secret key for admin operations (bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseSecretKey);

// GET - List all categories
export async function GET() {
  try {
    const categories = await listCategories(supabase);
    return NextResponse.json(categories);
  } catch (error) {
    if (error instanceof ApiError) {
      return toLegacyResponse(error);
    }
    console.error('Error in GET /api/category:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new category
export async function POST(request: Request) {
  // Check authentication
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    const category = await createCategory(supabase, {
      name: body.name,
      slug: body.slug,
      description: body.description,
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return toLegacyResponse(error);
    }
    console.error('Error in POST /api/category:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
