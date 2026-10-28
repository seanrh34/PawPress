import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import PostCard from '@/components/PostCard';
import { Category, Post } from '@/lib/types';
import { restCompare, restEq } from '@/lib/supabaseRest';

async function getCategory(slug: string): Promise<Category | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/categories?${restEq('slug', slug)}`, {
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
    return data[0] || null;
  } catch (error) {
    console.error('Error fetching category:', error);
    return null;
  }
}

async function getCategoryPosts(categoryId: string): Promise<Post[]> {
  try {
    const nowIso = new Date().toISOString();
    const query = [
      restEq('category_id', categoryId),
      'published_at=not.is.null',
      restCompare('published_at', 'lte', nowIso),
      'order=published_at.desc',
    ].join('&');
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/posts?${query}`, {
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return [];
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);

  if (!category) {
    return {
      title: 'Category Not Found',
    };
  }

  return {
    title: `${category.name} | PawPress`,
    description: category.description || `Browse all posts in the ${category.name} category.`,
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await getCategory(slug);

  if (!category) {
    notFound();
  }

  const posts = await getCategoryPosts(category.id);

  return (
    <div className="min-h-screen bg-platform">
      <main className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
        {/* Category Header */}
        <div className="mb-10 md:mb-14">
          <p className="portal-label text-signal">[ ] Category</p>
          <h1 className="portal-heading mt-3 break-words text-4xl md:text-6xl">{category.name}</h1>
          {category.description && (
            <p className="mt-4 max-w-2xl text-lg text-copy-muted">{category.description}</p>
          )}
        </div>

        {/* Posts Grid */}
        {posts.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <PostCard key={post.id} post={post} index={index} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-lg text-copy-muted">No posts in this category yet.</p>
          </div>
        )}

        <div className="mt-12">
          <Link href="/category" className="portal-label inline-flex min-h-11 items-center text-copy-muted hover:text-signal">
            ← All categories
          </Link>
        </div>
      </main>
    </div>
  );
}
