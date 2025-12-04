import { supabase } from './supabase';
import { Post } from './types';

// Fetch all published posts
export async function getAllPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false });

  if (error) {
    console.error('Error fetching posts:', error);
    return [];
  }

  return data || [];
}

// Fetch a single post by slug
export async function getPostBySlug(slug: string): Promise<Post | null> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    console.error('Error fetching post:', error);
    return null;
  }

  return data;
}
