'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface UserData {
  id: string;
  email: string;
  role: 'master' | 'admin';
  display_name: string | null;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();
      
      if (data.authenticated) {
        setUser(data.user);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/admin/login');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
      setLoggingOut(false);
    }
  };

  // Don't show header on login page
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left: Logo & Nav Links */}
            <div className="flex items-center gap-8">
              <Link href="/admin" className="text-xl font-bold text-gray-900">
                PawPress
              </Link>
              <nav className="hidden md:flex items-center gap-6">
                <Link
                  href="/admin"
                  className={`text-sm font-medium transition-colors ${
                    pathname === '/admin'
                      ? 'text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  href="/admin/posts/new"
                  className={`text-sm font-medium transition-colors ${
                    pathname === '/admin/posts/new'
                      ? 'text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  New Post
                </Link>
                {user?.role === 'master' && (
                  <Link
                    href="/admin/users"
                    className={`text-sm font-medium transition-colors ${
                      pathname === '/admin/users'
                        ? 'text-blue-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Manage Users
                  </Link>
                )}
                <Link
                  href="/admin/profile"
                  className={`text-sm font-medium transition-colors ${
                    pathname === '/admin/profile'
                      ? 'text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Profile
                </Link>
              </nav>
            </div>

            {/* Right: User Info & Actions */}
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                View Site
              </Link>
              
              {!loading && user && (
                <>
                  <div className="hidden sm:block border-l border-gray-300 h-6"></div>
                  <div className="hidden sm:flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {user.display_name || user.email}
                      </div>
                      <div className="text-xs text-gray-500">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                          user.role === 'master'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {user.role}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
              
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loggingOut ? 'Logging out...' : 'Logout'}
              </button>
            </div>
          </div>

          {/* Mobile Navigation */}
          <nav className="md:hidden border-t border-gray-200 py-3 flex gap-4 overflow-x-auto">
            <Link
              href="/admin"
              className={`text-sm font-medium whitespace-nowrap ${
                pathname === '/admin'
                  ? 'text-blue-600'
                  : 'text-gray-600'
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/admin/posts/new"
              className={`text-sm font-medium whitespace-nowrap ${
                pathname === '/admin/posts/new'
                  ? 'text-blue-600'
                  : 'text-gray-600'
              }`}
            >
              New Post
            </Link>
            {user?.role === 'master' && (
              <Link
                href="/admin/users"
                className={`text-sm font-medium whitespace-nowrap ${
                  pathname === '/admin/users'
                    ? 'text-blue-600'
                    : 'text-gray-600'
                }`}
              >
                Manage Users
              </Link>
            )}
            <Link
              href="/admin/profile"
              className={`text-sm font-medium whitespace-nowrap ${
                pathname === '/admin/profile'
                  ? 'text-blue-600'
                  : 'text-gray-600'
              }`}
            >
              Profile
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main>{children}</main>
    </div>
  );
}
