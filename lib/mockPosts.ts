import { Post } from './types';
import { SerializedEditorState } from 'lexical';

// Temporary mock data for development
// Once Supabase is fully configured, this will be replaced with real data
export const mockPosts: Post[] = [
  {
    id: '1',
    title: 'Getting Started with PawPress',
    slug: 'getting-started-with-pawpress',
    content_lexical: {} as SerializedEditorState, // Empty Lexical state for mock data
    content_html: '<p>Welcome to PawPress! This is your first blog post...</p>',
    excerpt: 'Learn how to set up and customize your PawPress CMS. Create beautiful blog posts with our intuitive editor.',
    featured_image_url: null,
    category_id: '00000000-0000-0000-0000-000000000000', // Default/mock category ID
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'Building with Next.js and Supabase',
    slug: 'building-with-nextjs-and-supabase',
    content_lexical: {} as SerializedEditorState, // Empty Lexical state for mock data
    content_html: '<p>Discover the power of combining Next.js with Supabase...</p>',
    excerpt: 'A modern stack for building fast, scalable applications. Explore the benefits of serverless architecture.',
    featured_image_url: null,
    category_id: '00000000-0000-0000-0000-000000000000', // Default/mock category ID
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    title: 'Customizing Your Blog Theme',
    slug: 'customizing-your-blog-theme',
    content_lexical: {} as SerializedEditorState, // Empty Lexical state for mock data
    content_html: '<p>Make your blog truly yours with custom styling...</p>',
    excerpt: 'Simple tips and tricks for customizing the look and feel of your blog. Make it stand out from the crowd.',
    featured_image_url: null,
    category_id: '00000000-0000-0000-0000-000000000000', // Default/mock category ID
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];
