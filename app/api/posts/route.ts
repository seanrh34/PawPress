import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { lexicalToHtml } from '@/lib/lexicalToHtml';
import { processAndUploadImages } from '@/lib/uploadImages';
import { getUser } from '@/lib/auth';

// GET all posts
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}

// POST create new post
export async function POST(request: NextRequest) {
  // Check authentication
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    let { title, slug, content_lexical, excerpt, featured_image_url, published_at } = body;

    // Validate required fields
    if (!title || !slug) {
      return NextResponse.json(
        { error: 'Title and slug are required' },
        { status: 400 }
      );
    }

    // Process base64 images: upload to Supabase and replace with permanent URLs
    if (content_lexical) {
      try {
        console.log("content_lexical:", content_lexical);
        console.log("content_lexical.root.children:", content_lexical.root.children);
        content_lexical = await processAndUploadImages(content_lexical);
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

    const { data, error } = await supabase
      .from('posts')
      .insert([
        {
          title,
          slug,
          content_lexical: content_lexical || null,
          content_html,
          excerpt: excerpt || '',
          featured_image_url: featured_image_url || null,
          published_at: published_at || null,
        },
      ])
      .select()
      .single();

    if (error) {
      // Check for unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A post with this slug already exists' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
}
