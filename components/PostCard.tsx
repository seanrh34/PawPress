import Link from 'next/link';
import Image from 'next/image';
import { Post } from '@/lib/types';

interface PostCardProps {
  post: Post;
  featured?: boolean;
}

// Fixed locale + timeZone so server and client render the same string (no hydration mismatch).
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export default function PostCard({ post, featured = false }: PostCardProps) {
  const published = post.published_at ? new Date(post.published_at) : null;
  const publishedLabel =
    published && !Number.isNaN(published.getTime()) ? dateFormatter.format(published) : null;

  return (
    <Link
      href={`/${post.slug}`}
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
        featured ? 'md:col-span-2 lg:col-span-3 lg:min-h-[320px] lg:flex-row' : ''
      }`}
    >
      {/* Featured Image */}
      <div
        className={`relative w-full shrink-0 overflow-hidden bg-gray-100 aspect-[16/9] ${
          featured ? 'lg:aspect-auto lg:w-[55%]' : ''
        }`}
      >
        {post.featured_image_url ? (
          <Image
            src={post.featured_image_url}
            alt=""
            fill
            sizes={
              featured
                ? '(max-width: 768px) 100vw, 700px'
                : '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw'
            }
            className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-gray-400">
            <svg className="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        {post.category && (
          <span className="mb-3 inline-flex w-fit items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {post.category.name}
          </span>
        )}

        <h3
          className={`font-semibold text-gray-900 line-clamp-2 ${
            featured ? 'text-2xl lg:text-3xl' : 'text-xl'
          }`}
        >
          {post.title}
        </h3>

        <p
          className={`mt-2 text-gray-600 ${
            featured ? 'line-clamp-3 lg:line-clamp-4' : 'line-clamp-3'
          }`}
        >
          {post.excerpt}
        </p>

        <div className="mt-auto pt-4 flex items-center justify-between gap-3 text-sm">
          {publishedLabel ? (
            <time dateTime={post.published_at ?? undefined} className="text-gray-500">
              {publishedLabel}
            </time>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1 font-medium text-blue-600 group-hover:text-blue-700">
            Read more
            <span
              aria-hidden="true"
              className="transition-transform motion-safe:group-hover:translate-x-0.5"
            >
              →
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
