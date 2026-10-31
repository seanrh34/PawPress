import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { Post } from '@/lib/types';
import { isPubliclyVisible } from '@/lib/cms/status';
import { restEq } from '@/lib/supabaseRest';

// Reserved slugs that should not match post routes
const RESERVED_SLUGS = ['admin', 'api', 'category', 'posts', 'styles'];

// Fixed locale + timeZone so server and client render the same string.
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

async function getPost(slug: string): Promise<Post | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/posts?${restEq('slug', slug)}`, {
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

    // Drafts and scheduled posts must not be publicly readable: hide them as
    // if they didn't exist (404), including from generateMetadata.
    if (!isPubliclyVisible(post)) {
      return null;
    }

    // Fetch category data if post has category_id
    if (post.category_id) {
      const categoryResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/categories?${restEq('id', String(post.category_id))}`, {
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
    ? dateFormatter.format(new Date(post.published_at))
    : 'Draft';

  return (
    <div className="min-h-screen bg-platform">
      <main className="mx-auto max-w-4xl px-5 py-12 md:px-8 md:py-16">
        <Link
          href="/#posts"
          className="portal-label inline-flex min-h-11 items-center text-copy-muted hover:text-signal"
        >
          ← All posts
        </Link>

        <article className="mt-6">
          {/* Post Header */}
          <header className="mb-8">
            {post.category && (
              <div className="mb-4">
                <Link
                  href={`/category/${post.category.slug}`}
                  className="portal-label inline-flex min-h-11 items-center rounded-full border border-copy px-2.5 text-copy hover:text-signal"
                >
                  {post.category.name}
                </Link>
              </div>
            )}

            <h1 className="portal-heading break-words text-4xl leading-tight md:text-5xl">{post.title}</h1>

            {/* Featured Image */}
            {post.featured_image_url && (
              <div className="mt-8">
                <img
                  src={post.featured_image_url}
                  alt={post.title}
                  className="w-full rounded-panel border border-rail"
                />
              </div>
            )}

            <div className="mt-4 flex items-center gap-4">
              <time dateTime={post.published_at || post.created_at} className="portal-label text-copy-muted">
                {publishedDate}
              </time>
            </div>
          </header>

          {/* Post Content - Rendered HTML */}
          <div className="rounded-panel border border-rail bg-platform-raised p-5 sm:p-10">
            <div
              className="post-content"
              dangerouslySetInnerHTML={{ __html: post.content_html }}
            />
          </div>
        </article>
      </main>
    </div>
  );
}
