'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  FiArrowUpRight,
  FiFolder,
  FiGrid,
  FiKey,
  FiLogOut,
  FiMenu,
  FiPlus,
  FiUser,
  FiUsers,
} from 'react-icons/fi';
import type { IconType } from 'react-icons';
import { useFocusTrap } from '@/components/admin/useFocusTrap';

interface UserData {
  id: string;
  email: string;
  role: 'master' | 'admin';
  display_name: string | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: IconType;
  masterOnly?: boolean;
}

const CONTENT_NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: FiGrid },
  { href: '/admin/posts/new', label: 'New post', icon: FiPlus },
  { href: '/admin/category', label: 'Categories', icon: FiFolder },
];

const SETTINGS_NAV: NavItem[] = [
  { href: '/admin/tokens', label: 'API tokens', icon: FiKey },
  { href: '/admin/users', label: 'Users', icon: FiUsers, masterOnly: true },
  { href: '/admin/profile', label: 'Profile', icon: FiUser },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  if (href === '/admin/category') return pathname.startsWith('/admin/category');
  return pathname === href;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useFocusTrap<HTMLDivElement>(menuOpen, menuButtonRef);

  useEffect(() => {
    fetchUser();

    // Listen for profile update events
    const handleProfileUpdate = () => {
      fetchUser();
    };

    window.addEventListener('profileUpdated', handleProfileUpdate);

    return () => {
      window.removeEventListener('profileUpdated', handleProfileUpdate);
    };
  }, [pathname]); // Refetch when route changes

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Drawer behaviour: Escape closes and body scroll locks while open. Focus
  // moves into the drawer, is trapped inside and returns to the Menu button
  // via useFocusTrap.
  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/session', {
        cache: 'no-store', // Prevent caching
      });
      const data = await response.json();

      if (data.authenticated) {
        setUser(data.user);
        setLoggingOut(false); // Reset logging out state when user is authenticated
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    setMenuOpen(false);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null); // Clear user state immediately
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

  const settingsItems = SETTINGS_NAV.filter(
    (item) => !item.masterOnly || user?.role === 'master',
  );
  const currentPage = [...CONTENT_NAV, ...SETTINGS_NAV].find((item) =>
    isActive(pathname, item.href),
  );

  const renderNav = (onNavigate?: () => void) => (
    <nav aria-label="Admin" className="flex flex-col gap-6">
      <div>
        <p className="admin-nav-heading portal-label">Content</p>
        <div className="flex flex-col gap-1">
          {CONTENT_NAV.map((item) => (
            <NavItemLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
      <div>
        <p className="admin-nav-heading portal-label">Settings</p>
        <div className="flex flex-col gap-1">
          {settingsItems.map((item) => (
            <NavItemLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </nav>
  );

  const renderUserBlock = () => (
    <>
      {!loading && user && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-copy">
            {user.display_name || user.email}
          </span>
          <span
            className={`status-badge ${
              user.role === 'master' ? 'status-badge-master' : 'status-badge-admin'
            }`}
          >
            {user.role}
          </span>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Link href="/" className="admin-btn admin-btn-ghost w-full justify-between">
          View site
          <FiArrowUpRight size={16} aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="admin-btn admin-btn-secondary w-full"
        >
          <FiLogOut size={16} aria-hidden="true" />
          {loggingOut ? 'Logging out...' : 'Log out'}
        </button>
      </div>
    </>
  );

  return (
    <div className="admin-shell min-h-screen bg-platform text-copy">
      {/* Fixed sidebar, lg and up */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-rail bg-platform-raised lg:flex">
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <Image
            src="/34cats_main_light.png"
            alt="34cats"
            width={240}
            height={120}
            className="h-10 w-auto"
            priority
          />
          <span className="portal-label text-copy-muted">PawPress admin</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">{renderNav()}</div>
        <div className="border-t border-rail p-4">{renderUserBlock()}</div>
      </aside>

      {/* Sticky top bar, below lg */}
      <header className="sticky top-0 z-40 border-b border-rail bg-platform-raised/90 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/34cats_main_light.png"
              alt="34cats"
              width={240}
              height={120}
              className="h-8 w-auto"
              priority
            />
            <span className="portal-label truncate text-copy-muted">
              {currentPage?.label ?? 'Admin'}
            </span>
          </div>
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="admin-mobile-nav"
            className="admin-btn admin-btn-secondary"
          >
            <FiMenu size={16} aria-hidden="true" />
            Menu
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-copy/30"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            id="admin-mobile-nav"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Admin menu"
            className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-rail bg-platform-raised"
          >
            <div className="flex items-center gap-3 px-5 pb-4 pt-5">
              <Image
                src="/34cats_main_light.png"
                alt="34cats"
                width={240}
                height={120}
                className="h-8 w-auto"
              />
              <span className="portal-label text-copy-muted">PawPress admin</span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {renderNav(() => setMenuOpen(false))}
            </div>
            <div className="border-t border-rail p-4">{renderUserBlock()}</div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="lg:pl-60">
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10 lg:px-10">{children}</main>
      </div>
    </div>
  );
}

function NavItemLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className="admin-nav-item"
      onClick={onNavigate}
    >
      <Icon size={16} aria-hidden="true" />
      {item.label}
    </Link>
  );
}
