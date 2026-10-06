export interface PostCategory {
  id: string;
  slug: string;
  name: string;
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  status: 'draft' | 'published';
  published_at: string | null;
  category: PostCategory | null;
  featured_image_url: string | null;
  created_at: string;
  updated_at: string;
  content?: unknown;
  content_format?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface PostList {
  items: Post[];
  total: number;
}

export interface CategoryList {
  items: Category[];
}

export interface MeResponse {
  user: { id: string; email: string; role: string };
  token: { id: string; name: string; scopes: string[]; expires_at: string };
}

export interface MediaResponse {
  url: string;
  content_type: string;
  size: number;
}

export interface DeletedResponse {
  deleted: boolean;
  id: string;
}

export type ContentFormat = 'markdown' | 'lexical' | 'html';
