export interface Post {
  id: string;
  title: string;
  slug: string;
  content_html: string;
  excerpt: string;
  featured_image_url: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
