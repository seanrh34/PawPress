import { Post } from "@/lib/types";
import HeroSection from "@/components/landing/HeroSection";
import PostsSection from "@/components/landing/PostsSection";
import PawPressSection from "@/components/landing/PawPressSection";
import ContactSection from "@/components/landing/ContactSection";

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
    <div className="min-h-screen">
      <HeroSection />
      <PostsSection posts={posts} />
      <PawPressSection />
      <ContactSection />
    </div>
  );
}
