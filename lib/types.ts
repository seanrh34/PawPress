import { SerializedEditorState } from 'lexical';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  content_lexical: SerializedEditorState;
  content_html: string;
  excerpt: string;
  featured_image_url: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  category_id: string;
  category?: Category;
}
