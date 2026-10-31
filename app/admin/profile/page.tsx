'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/admin/PageHeader';

interface UserData {
  id: string;
  email: string;
  role: 'master' | 'admin';
  display_name: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();

      if (!data.authenticated) {
        router.push('/admin/login');
        return;
      }

      setUser(data.user);
      setDisplayName(data.user.display_name || '');
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName || null }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to update profile');
        setSaving(false);
        return;
      }

      setSuccess('Profile updated successfully!');
      setUser(data.profile);
      // Force router to refetch layout data
      router.refresh();
      // Refetch profile to ensure we have latest data
      await fetchProfile();
      // Trigger event for layout to update
      window.dispatchEvent(new Event('profileUpdated'));
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <div className="text-copy-muted">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Profile Settings"
        description="Manage your account information"
      />

      {error && (
        <div className="admin-alert admin-alert-error mb-6">
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="admin-alert admin-alert-success mb-6">
          <p>{success}</p>
        </div>
      )}

      <div className="admin-card max-w-2xl">
        <div className="mb-6 border-b border-rail pb-6">
          <h2 className="text-lg font-semibold">Account Information</h2>
          <div className="mt-4 space-y-3">
            <div>
              <p className="admin-label">Email</p>
              <p className="text-copy">{user.email}</p>
            </div>
            <div>
              <p className="admin-label">Role</p>
              <span
                className={`status-badge mt-1 ${
                  user.role === 'master' ? 'status-badge-master' : 'status-badge-admin'
                }`}
              >
                {user.role}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <h2 className="text-lg font-semibold">Display Name</h2>
          <div className="mt-4">
            <label htmlFor="display-name" className="admin-label">
              Display Name
            </label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
              className="admin-input"
              disabled={saving}
            />
            <p className="admin-hint">This name will be displayed as the author of your posts</p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="admin-btn admin-btn-primary mt-6"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
