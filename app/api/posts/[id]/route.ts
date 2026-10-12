import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { processAndUploadImages } from '@/lib/uploadImages';
import { getUser } from '@/lib/auth';
import { ApiError, toLegacyResponse } from '@/lib/cms/errors';
import { isUuid } from '@/lib/cms/categoryService';
import { assertNoForeignLock, getLock } from '@/lib/cms/lockService';
import { deletePost, updatePost, type UpdatePostPatch } from '@/lib/cms/postService';

/** `force=1` via query string or a JSON body `{ force: true }`. */
async function readForce(request: NextRequest): Promise<boolean> {
  if (new URL(request.url).searchParams.get('force') === '1') {
    return true;
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return false;
  }
  try {
    const body = (await request.json()) as { force?: unknown };
    return body?.force === true || body?.force === 1 || body?.force === '1';
  } catch {
    return false;
  }
}

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
    // anonymous client only sees posts that are already live (a scheduled post
    // 404s until it goes live).
    const db = user ? await getAuthenticatedSupabaseClient() : supabase;

    let query = db.from('posts').select('*').eq('id', id);
    if (!user) {
      query = query.lte('published_at', new Date().toISOString());
    }

    const { data, error } = await query.single();

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

    // Optional edit-lock session and concurrency revision. Both are additive:
    // absent from the body means the old behaviour exactly.
    const lockSessionId = body.lock_session_id;
    if (
      lockSessionId !== undefined &&
      (typeof lockSessionId !== 'string' || !isUuid(lockSessionId))
    ) {
      return NextResponse.json(
        { error: 'lock_session_id must be a UUID' },
        { status: 400 },
      );
    }
    const ifUpdatedAt =
      typeof body.if_updated_at === 'string' ? body.if_updated_at : undefined;

    // A future published_at schedules the post; anything present must at least
    // be a parseable date (the editor sends an ISO string or null).
    if (body.published_at !== undefined && body.published_at !== null) {
      if (
        typeof body.published_at !== 'string' ||
        Number.isNaN(Date.parse(body.published_at))
      ) {
        throw ApiError.validation('published_at must be a valid date');
      }
    }

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

    // If the editor tells us which session it holds, refuse when someone else
    // has taken it over in the meantime. The lock table has no RLS policies, so
    // the service-role client is required to read it.
    if (lockSessionId !== undefined) {
      const admin = createAdminClient();
      try {
        await assertNoForeignLock(admin, id, lockSessionId, user.id);
      } catch (lockError) {
        if (lockError instanceof ApiError && lockError.code === 'locked') {
          const holder = (lockError.details as { holder?: unknown } | undefined)
            ?.holder;
          return NextResponse.json(
            { error: lockError.message, code: 'locked', holder },
            { status: 409 },
          );
        }
        throw lockError;
      }
    }

    const data = await updatePost(authSupabase, id, patch, { ifUpdatedAt });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === 'conflict') {
        const details = error.details as
          | { current_updated_at?: string }
          | undefined;
        return NextResponse.json(
          {
            error: 'This post was changed since you opened it.',
            code: 'conflict',
            current_updated_at: details?.current_updated_at,
          },
          { status: 409 },
        );
      }
      if (error.code === 'locked') {
        const holder = (error.details as { holder?: unknown } | undefined)?.holder;
        return NextResponse.json(
          { error: error.message, code: 'locked', holder },
          { status: 409 },
        );
      }
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

    const force = await readForce(request);

    // Refuse to delete a post an agent is actively editing, unless forced. A
    // human's own lock does not block deletion (they are in the session).
    const admin = createAdminClient();
    const lock = await getLock(admin, id);
    if (lock && lock.holder.kind === 'agent' && !force) {
      return NextResponse.json(
        {
          error: `An AI agent is editing this post: ${lock.holder.label}. Deletion refused.`,
          code: 'locked',
          holder: lock.holder,
        },
        { status: 409 },
      );
    }

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
