import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { lexicalToHtml } from '@/lib/lexicalToHtml';
import { processAndUploadImages } from '@/lib/uploadImages';
import { getUser } from '@/lib/auth';

// GET single post by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Check if user is authenticated
    const user = await getUser();
    
    let data, error;
    
    if (user) {
      // Authenticated users (admins) can see all posts including drafts
      const authSupabase = await getAuthenticatedSupabaseClient();
      const result = await authSupabase
        .from('posts')
        .select('*')
        .eq('id', id)
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Public users can only see published posts
      const result = await supabase
        .from('posts')
        .select('*')
        .eq('id', id)
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch post' },
      { status: 500 }
    );
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
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    let { title, slug, content_lexical, excerpt, featured_image_url, published_at, category_id } = body;

    // Check for reserved slugs if slug is being updated
    if (slug) {
      const reservedSlugs = ['admin', 'api', 'category', 'posts', 'styles'];
      if (reservedSlugs.includes(slug)) {
        return NextResponse.json(
          { error: 'This slug is reserved and cannot be used' },
          { status: 400 }
        );
      }
    }

    // Validate category if provided
    if (category_id) {
      const { data: category, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('id', category_id)
        .single();

      if (categoryError || !category) {
        return NextResponse.json(
          { error: 'Invalid category' },
          { status: 400 }
        );
      }
    }

    // Process blob images: upload to Supabase and replace with permanent URLs
    if (content_lexical) {
      try {
        content_lexical = await processAndUploadImages(content_lexical);
        console.log('Images processed successfully');
      } catch (error) {
        console.error('Error processing images:', error);
        // Continue anyway - images might just not upload
      }
    }

    // Generate HTML from Lexical JSON
    let content_html = '';
    if (content_lexical) {
      try {
        content_html = await lexicalToHtml(content_lexical);
      } catch (error) {
        console.error('Error converting Lexical to HTML:', error);
        // Continue with empty HTML rather than failing the request
      }
    }

    // Use authenticated client for admin operations
    const authSupabase = await getAuthenticatedSupabaseClient();
    
    const updateData: any = {
      title,
      slug,
      content_lexical,
      content_html,
      excerpt,
      featured_image_url,
      published_at,
      updated_at: new Date().toISOString(),
    };

    // Only update category_id if provided
    if (category_id) {
      updateData.category_id = category_id;
    }

    const { data, error } = await authSupabase
      .from('posts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A post with this slug already exists' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update post' },
      { status: 500 }
    );
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
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    
    // Use authenticated client for admin operations
    const authSupabase = await getAuthenticatedSupabaseClient();
    
    const { error } = await authSupabase
      .from('posts')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    );
  }
}
