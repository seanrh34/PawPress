import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { Post, Category } from '@/lib/types';

// Reserved slugs that should not match post routes
const RESERVED_SLUGS = ['admin', 'api', 'category', 'posts', 'styles'];

async function getPost(slug: string): Promise<Post | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/posts?slug=eq.${slug}`, {
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!data[0]) return null;

    const post = data[0];

    // Fetch category data if post has category_id
    if (post.category_id) {
      const categoryResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/categories?id=eq.${post.category_id}`, {
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        },
        cache: 'no-store',
      });

      if (categoryResponse.ok) {
        const categoryData = await categoryResponse.json();
        if (categoryData[0]) {
          post.category = categoryData[0];
        }
      }
    }

    return post;
  } catch (error) {
    console.error('Error fetching post:', error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  return {
    title: `${post.title} | PawPress`,
    description: post.excerpt || 'Read this post on PawPress',
    openGraph: {
      title: post.title,
      description: post.excerpt || '',
      images: post.featured_image_url ? [post.featured_image_url] : [],
    },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Check if slug is reserved
  if (RESERVED_SLUGS.includes(slug)) {
    notFound();
  }

  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  const publishedDate = post.published_at 
    ? new Date(post.published_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Draft';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Post Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <article>
          {/* Post Header */}
          <header className="mb-8">
            {/* Category Badge */}
            {post.category && (
              <div className="mb-4">
                <Link 
                  href={`/category/${post.category.slug}`}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
                >
                  {post.category.name}
                </Link>
              </div>
            )}

            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              {post.title}
            </h1>
            
            {/* Featured Image */}
            {post.featured_image_url && (
              <div className="mb-8">
                <img 
                  src={post.featured_image_url} 
                  alt={post.title}
                  className="w-full rounded-lg"
                />
              </div>
            )}

            <div className="flex items-center gap-4 text-sm text-gray-500">
              <time dateTime={post.published_at || post.created_at}>
                {publishedDate}
              </time>
            </div>
          </header>

          {/* Post Content - Rendered HTML */}
          <div 
            className="post-content"
            dangerouslySetInnerHTML={{ __html: post.content_html }}
          />
        </article>
      </main>
    </div>
  );
}
