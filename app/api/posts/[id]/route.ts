import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { lexicalToHtml } from '@/lib/lexicalToHtml';

// GET single post by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', params.id)
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
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { title, slug, content_lexical, excerpt, featured_image_url, published_at } = body;

    // Generate HTML from Lexical JSON
    let content_html = '';
    if (content_lexical) {
      try {
        content_html = lexicalToHtml(content_lexical);
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
      .eq('id', params.id)
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
  { params }: { params: { id: string } }
) {
  try {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', params.id);

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
