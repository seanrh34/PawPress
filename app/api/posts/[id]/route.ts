import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { processAndUploadImages } from '@/lib/uploadImages';
import { getUser } from '@/lib/auth';
import { ApiError, toLegacyResponse } from '@/lib/cms/errors';
import { deletePost, updatePost, type UpdatePostPatch } from '@/lib/cms/postService';

// GET single post by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if user is authenticated
    const user = await getUser();

    // Authenticated users (admins) can see all posts including drafts; the
    // anonymous client only sees published posts (enforced by RLS).
    const db = user ? await getAuthenticatedSupabaseClient() : supabase;

    const { data, error } = await db
      .from('posts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch post:', error);
    return NextResponse.json({ error: 'Failed to fetch post' }, { status: 500 });
  }
}

// PUT update post
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check authentication
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    let { content_lexical } = body;

    // Process blob images: upload to Supabase and replace with permanent URLs
    if (content_lexical) {
      try {
        content_lexical = await processAndUploadImages(content_lexical);
      } catch (error) {
        console.error('Error processing images:', error);
        // Continue anyway - images might just not upload
      }
    }

    // Only touch fields that were actually sent. In particular, when no
    // content is provided we must not overwrite content_html/content_lexical.
    const patch: UpdatePostPatch = {};
    if ('title' in body) patch.title = body.title;
    if ('slug' in body) patch.slug = body.slug;
    if ('excerpt' in body) patch.excerpt = body.excerpt;
    if ('category_id' in body) patch.category_id = body.category_id;
    if ('featured_image_url' in body) {
      patch.featured_image_url = body.featured_image_url;
    }
    if ('published_at' in body) patch.published_at = body.published_at;
    if ('content_lexical' in body) patch.content_lexical = content_lexical;

    // Use authenticated client for admin operations
    const authSupabase = await getAuthenticatedSupabaseClient();

    const data = await updatePost(authSupabase, id, patch);

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ApiError) {
      return toLegacyResponse(error);
    }
    console.error('Failed to update post:', error);
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  }
}

// DELETE post
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check authentication
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Use authenticated client for admin operations
    const authSupabase = await getAuthenticatedSupabaseClient();

    await deletePost(authSupabase, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) {
      return toLegacyResponse(error);
    }
    console.error('Failed to delete post:', error);
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }
}
