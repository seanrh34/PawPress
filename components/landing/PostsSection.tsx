import PostCard from '@/components/PostCard';
import { Post } from '@/lib/types';

interface PostsSectionProps {
  posts: Post[];
}

export default function PostsSection({ posts }: PostsSectionProps) {
  return (
    <section id="posts" className="bg-gray-50 py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Latest Posts
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Discover our latest articles, tutorials, and insights. Stay updated with fresh content 
            covering web development, technology trends, and best practices in modern software engineering.
          </p>
        </div>

        {posts.length > 0 ? (
          <>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 mb-12">
              {posts.slice(0, 6).map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
            
            {posts.length > 6 && (
              <div className="text-center">
                <p className="text-gray-600 mb-6">
                  {posts.length - 6} more {posts.length - 6 === 1 ? 'post' : 'posts'} available
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-2xl font-semibold text-gray-700 mb-2">No Posts Yet</h3>
            <p className="text-gray-600 mb-6">
              Be the first to publish content! Our admin dashboard makes it easy to create and share your stories.
            </p>
            <p className="text-sm text-gray-500">
              Check back soon for new articles and updates.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
