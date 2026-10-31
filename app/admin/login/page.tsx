'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();

      if (data.authenticated) {
        setIsAuthenticated(true);
        setUserEmail(data.user.email || '');
      }
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setIsAuthenticated(false);
      setUserEmail('');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      // Redirect to admin dashboard on success
      router.push('/admin');
      router.refresh();
    } catch (err) {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-platform text-copy">
        <div className="text-copy-muted">Loading...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-platform px-4 py-12 text-copy">
        <div className="hero-dots pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="admin-card relative w-full max-w-sm text-center">
          <Image
            src="/34cats_main_light.png"
            alt="34cats"
            width={240}
            height={120}
            className="mx-auto h-10 w-auto"
          />
          <h2 className="portal-heading mt-4 text-2xl tracking-tight">PawPress Admin</h2>
          <p className="mt-2 text-sm text-copy-muted">You are already logged in</p>

          <div className="admin-alert admin-alert-success mt-4 text-left">
            Logged in as: <strong>{userEmail}</strong>
          </div>

          <div className="mt-6 space-y-2">
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="admin-btn admin-btn-primary w-full"
            >
              Go to Dashboard
            </button>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loading}
              className="admin-btn admin-btn-secondary w-full"
            >
              {loading ? 'Logging out...' : 'Log out'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-platform px-4 py-12 text-copy">
      <div className="hero-dots pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="admin-card relative w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/34cats_main_light.png"
            alt="34cats"
            width={240}
            height={120}
            className="h-10 w-auto"
          />
          <h1 className="portal-heading mt-4 text-2xl tracking-tight">Sign in to PawPress</h1>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="admin-alert admin-alert-error" role="alert">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="admin-label">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              placeholder="john@example.com"
              onChange={(e) => setEmail(e.target.value)}
              className="admin-input"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="password" className="admin-label">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              placeholder="$ecretPass123"
              onChange={(e) => setPassword(e.target.value)}
              className="admin-input"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="admin-btn admin-btn-primary w-full"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <Link href="/" className="admin-btn admin-btn-ghost mt-2 w-full">
          <FiArrowLeft size={16} aria-hidden="true" />
          Back to the blog
        </Link>
      </div>
    </div>
  );
}
