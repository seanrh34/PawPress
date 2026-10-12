import { supabase } from './supabase';
import { Post } from './types';

/**
 * True when a post is visible to anonymous visitors: it has a `published_at`
 * that is not in the future. Drafts (null) and scheduled (future) posts are
 * hidden until they go live.
 */
export function isPubliclyVisible(
  post: Pick<Post, 'published_at'>,
  now: Date = new Date(),
): boolean {
  if (!post.published_at) {
    return false;
  }
  const ts = Date.parse(post.published_at);
  return !Number.isNaN(ts) && ts <= now.getTime();
}

// Fetch all published posts (scheduled posts are hidden until they go live)
export async function getAllPosts(): Promise<Post[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .not('published_at', 'is', null)
    .lte('published_at', nowIso)
    .order('published_at', { ascending: false });

  if (error) {
    console.error('Error fetching posts:', error);
    return [];
  }

  return data || [];
}

// Fetch a single published post by slug
export async function getPostBySlug(slug: string): Promise<Post | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('slug', slug)
    .not('published_at', 'is', null)
    .lte('published_at', nowIso)
    .single();

  if (error) {
    console.error('Error fetching post:', error);
    return null;
  }

  return data;
}
