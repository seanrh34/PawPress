import { supabase } from './supabase';
import { Post } from './types';

export { isPubliclyVisible } from './cms/status';

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
