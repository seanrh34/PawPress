import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { lexicalToHtml } from '@/lib/lexicalToHtml';
import { processAndUploadImages } from '@/lib/uploadImages';

// GET single post by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', id)
      .single();

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
  try {
    const { id } = await params;
    const body = await request.json();
    let { title, slug, content_lexical, excerpt, featured_image_url, published_at } = body;

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

    const { data, error } = await supabase
      .from('posts')
      .update({
        title,
        slug,
        content_lexical,
        content_html,
        excerpt,
        featured_image_url,
        published_at,
        updated_at: new Date().toISOString(),
      })
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
  try {
    const { id } = await params;
    const { error } = await supabase
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
