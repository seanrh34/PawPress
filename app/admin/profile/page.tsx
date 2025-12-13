'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

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
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-gray-600">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account information</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <div className="mb-6 pb-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-600">Email</label>
              <p className="text-gray-900 mt-1">{user.email}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600">Role</label>
              <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full mt-1 ${
                user.role === 'master' 
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {user.role}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Display Name</h2>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              disabled={saving}
            />
            <p className="text-xs text-gray-500 mt-1">
              This name will be displayed as the author of your posts
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
