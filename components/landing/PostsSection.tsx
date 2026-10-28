'use client';

import { useState } from 'react';
import Link from 'next/link';
import PostCard from '@/components/PostCard';
import { Cat } from '@/components/brand/cat';
import { Reveal } from '@/components/motion/reveal';
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
    <section id="posts" className="px-5 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-10 md:mb-14 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="portal-label text-signal">[01] Latest writing</p>
            <h2 className="portal-heading mt-3 text-4xl md:text-6xl">Latest posts</h2>
          </div>
          <div className="sm:text-right">
            <Link href="/category" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-signal hover:underline">
              All categories <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Reveal>

        {posts.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {currentPosts.map((post, index) => (
                <PostCard
                  key={post.id}
                  post={post}
                  index={index}
                  featured={currentPage === 1 && index === 0}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-10 flex flex-col items-center gap-4">
                <p className="portal-label text-copy-muted">
                  Showing {indexOfFirstPost + 1} to {Math.min(indexOfLastPost, posts.length)} of {posts.length}
                </p>

                <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
                  {/* Previous Button */}
                  <button
                    onClick={goToPrevious}
                    disabled={currentPage === 1}
                    className="portal-button portal-button-secondary rounded-full disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>

                  {/* Page Numbers */}
                  <div className="flex flex-wrap justify-center gap-2">
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
                          <span key={pageNumber} className="portal-label flex min-h-11 items-center px-1 text-copy-muted">
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
                          className={`portal-button rounded-full ${
                            currentPage === pageNumber ? 'portal-button-primary' : 'portal-button-secondary'
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
                    className="portal-button portal-button-secondary rounded-full disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <Reveal variant="tilt" tilt="-1deg" className="mx-auto max-w-xl">
            <div className="note-card relative rounded-panel border border-rail-strong bg-platform-raised px-7 py-10 pt-12 text-center md:p-12">
              <span className="note-tape" aria-hidden="true" />
              <Cat className="mx-auto w-24" still />
              <h3 className="portal-heading mt-4 text-2xl">Nothing published yet.</h3>
              <p className="mt-2 text-copy-muted">Check back soon.</p>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
