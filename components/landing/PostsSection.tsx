'use client';

import { useState } from 'react';
import Link from 'next/link';
import PostCard from '@/components/PostCard';
import { Post } from '@/lib/types';

interface PostsSectionProps {
  posts: Post[];
}

export default function PostsSection({ posts }: PostsSectionProps) {
  const [selectedPage, setSelectedPage] = useState(1);
  const postsPerPage = 6; // Always 6 posts per page

  // Calculate pagination values
  const totalPages = Math.ceil(posts.length / postsPerPage);
  // Derive the active page during render so a shrinking list can never leave
  // us on a page that no longer exists (no effect needed).
  const currentPage = Math.min(selectedPage, Math.max(totalPages, 1));
  const indexOfLastPost = currentPage * postsPerPage;
  const indexOfFirstPost = indexOfLastPost - postsPerPage;
  const currentPosts = posts.slice(indexOfFirstPost, indexOfLastPost);

  const goToPage = (pageNumber: number) => {
    setSelectedPage(pageNumber);
    // Offset from the sticky header is handled by CSS scroll-margin-top.
    document.getElementById('posts')?.scrollIntoView();
  };

  const goToPrevious = () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  };

  const goToNext = () => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  };

  return (
    <section id="posts" className="bg-gray-50 py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10 sm:mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Latest posts</h2>
            <p className="mt-2 max-w-xl text-gray-600">
              Thoughts, experiences, and insights on web development, technology, and design.
            </p>
          </div>
          <Link
            href="/category"
            className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            All categories
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        {posts.length > 0 ? (
          <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {currentPosts.map((post, index) => (
                <PostCard
                  key={post.id}
                  post={post}
                  featured={currentPage === 1 && index === 0}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Page Info */}
                <p className="text-sm text-gray-600">
                  Showing {indexOfFirstPost + 1} - {Math.min(indexOfLastPost, posts.length)} of {posts.length} posts
                </p>

                {/* Pagination Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {/* Previous Button */}
                  <button
                    onClick={goToPrevious}
                    disabled={currentPage === 1}
                    className="inline-flex min-h-11 items-center px-4 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    Previous
                  </button>

                  {/* Page Numbers */}
                  <div className="flex flex-wrap justify-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => {
                      // Show all pages if total pages <= 7
                      // Otherwise show first, last, current, and adjacent pages
                      const showPage =
                        totalPages <= 7 ||
                        pageNumber === 1 ||
                        pageNumber === totalPages ||
                        (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1);

                      const showEllipsis =
                        (pageNumber === 2 && currentPage > 3) ||
                        (pageNumber === totalPages - 1 && currentPage < totalPages - 2);

                      if (showEllipsis) {
                        return (
                          <span key={pageNumber} className="px-3 py-2 text-gray-500">
                            …
                          </span>
                        );
                      }

                      if (!showPage) return null;

                      return (
                        <button
                          key={pageNumber}
                          onClick={() => goToPage(pageNumber)}
                          aria-current={currentPage === pageNumber ? 'page' : undefined}
                          className={`min-w-[44px] min-h-[44px] px-2 inline-flex items-center justify-center text-sm font-medium rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                            currentPage === pageNumber
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}
                  </div>

                  {/* Next Button */}
                  <button
                    onClick={goToNext}
                    disabled={currentPage === totalPages}
                    className="inline-flex min-h-11 items-center px-4 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13h-4a2 2 0 01-2-2V9a2 2 0 012-2h4a2 2 0 012 2v10a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900">No posts yet</h3>
            <p className="mx-auto mt-2 max-w-md text-gray-600">
              Nothing published here so far. Check back soon for new articles and updates.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
