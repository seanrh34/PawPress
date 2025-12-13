import Link from "next/link";
import PostCard from "@/components/PostCard";
import { Post } from "@/lib/types";

async function getPublishedPosts(): Promise<Post[]> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/posts?published_at=not.is.null&order=published_at.desc`, {
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('Failed to fetch posts');
      return [];
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
}

export default async function Home() {
  const posts = await getPublishedPosts();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">PawPress</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to PawPress
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            A simple, customizable CMS built with Next.js and Supabase. 
            Fork this repo and make it your own!
          </p>
        </div>

        {/* Posts Grid - Dynamic */}
        {posts.length > 0 ? (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-600">No posts yet. Check back soon!</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-gray-600">
            Built with Next.js & Supabase | Customizable & Forkable
          </p>
        </div>
      </footer>
    </div>
  );
}
