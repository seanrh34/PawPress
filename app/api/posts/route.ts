import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { processAndUploadImages } from '@/lib/uploadImages';
import { getUser } from '@/lib/auth';
import { ApiError, toLegacyResponse } from '@/lib/cms/errors';
import { createPost } from '@/lib/cms/postService';

// GET all posts
export async function GET() {
  try {
    // Check if user is authenticated
    const user = await getUser();

    // Authenticated users (admins) can see all posts including drafts; the
    // anonymous client only sees published posts (enforced by RLS).
    const db = user ? await getAuthenticatedSupabaseClient() : supabase;

    const { data, error } = await db
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw ApiError.internal(error.message);
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ApiError) {
      return toLegacyResponse(error);
    }
    console.error('Failed to fetch posts:', error);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}

// POST create new post
export async function POST(request: NextRequest) {
  // Check authentication
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    let { content_lexical } = body;

    // Process base64 images: upload to Supabase and replace with permanent URLs
    if (content_lexical) {
      try {
        content_lexical = await processAndUploadImages(content_lexical);
      } catch (error) {
        console.error('Error processing images:', error);
        // Continue anyway - images might just not upload
      }
    }

    // Use authenticated client for admin operations
    const authSupabase = await getAuthenticatedSupabaseClient();

    const data = await createPost(authSupabase, {
      title: body.title,
      slug: body.slug,
      excerpt: body.excerpt,
      category_id: body.category_id,
      featured_image_url: body.featured_image_url,
      content_lexical,
      published_at: body.published_at,
    });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return toLegacyResponse(error);
    }
    console.error('Failed to create post:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
