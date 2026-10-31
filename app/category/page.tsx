import Link from 'next/link';
import { Metadata } from 'next';
import { Category } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Categories | PawPress',
  description: 'Browse posts by category to find content that interests you.',
};

async function getAllCategories(): Promise<Category[]> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/categories?order=name.asc`, {
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
    console.error('Error fetching categories:', error);
    return [];
  }
}

export default async function CategoriesPage() {
  const categories = await getAllCategories();

  return (
    <div className="min-h-screen bg-platform">
      <main className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
        {/* Page Header */}
        <div className="mb-10 md:mb-14">
          <p className="portal-label text-signal">[ ] Categories</p>
          <h1 className="portal-heading mt-3 text-4xl md:text-6xl">Categories</h1>
          <p className="mt-4 max-w-2xl text-lg text-copy-muted">
            Browse posts by category to find content that interests you.
          </p>
        </div>

        {/* Categories Grid */}
        {categories.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <Link key={category.id} href={`/category/${category.slug}`} className="app-card group relative block h-full min-w-0">
                <div className="flex h-full min-w-0 flex-col rounded-panel border border-rail bg-platform-raised p-6 md:p-8">
                  <h2 className="portal-heading break-words text-2xl text-copy">{category.name}</h2>
                  {category.description && (
                    <p className="mt-2 line-clamp-3 flex-1 text-copy-muted">{category.description}</p>
                  )}
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-signal">
                    View posts{' '}
                    <span aria-hidden="true" className="transition-transform motion-safe:group-hover:translate-x-0.5">
                      →
                    </span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-lg text-copy-muted">No categories available yet.</p>
          </div>
        )}
      </main>
    </div>
  );
}
