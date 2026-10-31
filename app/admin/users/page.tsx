'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/admin/PageHeader';

interface User {
  id: string;
  email: string;
  role: 'master' | 'admin';
  display_name: string | null;
  created_at: string;
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form fields
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          router.push('/admin');
          return;
        }
        setError(data.error || 'Failed to fetch users');
        return;
      }

      setUsers(data);
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          display_name: newDisplayName || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to create admin');
        setCreating(false);
        return;
      }

      // Reset form and refresh list
      setNewEmail('');
      setNewPassword('');
      setNewDisplayName('');
      setShowCreateForm(false);
      fetchUsers();
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAdmin = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to delete user: ${email}?`)) {
      return;
    }

    setDeleting(userId);
    setError('');

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to delete user');
        setDeleting(null);
        return;
      }

      fetchUsers();
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <div className="text-copy-muted">Loading users...</div>
      </div>
    );
  }

  const renderDeleteButton = (user: User) =>
    user.role !== 'master' && (
      <button
        type="button"
        onClick={() => handleDeleteAdmin(user.id, user.email)}
        disabled={deleting === user.id}
        className="admin-btn admin-btn-ghost-danger"
      >
        {deleting === user.id ? 'Deleting...' : 'Delete'}
      </button>
    );

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="User Management"
        description="Manage admin accounts"
        actions={
          !showCreateForm && (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="admin-btn admin-btn-primary"
            >
              Create New Admin
            </button>
          )
        }
      />

      {error && (
        <div className="admin-alert admin-alert-error mb-6">
          <p>{error}</p>
        </div>
      )}

      {showCreateForm && (
        <div className="admin-card mb-6 max-w-2xl">
          <h2 className="text-lg font-semibold">Create New Admin Account</h2>
          <form onSubmit={handleCreateAdmin} className="mt-4 space-y-4">
            <div>
              <label htmlFor="new-email" className="admin-label">
                Email
              </label>
              <input
                id="new-email"
                type="email"
                required
                value={newEmail}
                placeholder="john@example.com"
                onChange={(e) => setNewEmail(e.target.value)}
                className="admin-input"
                disabled={creating}
              />
            </div>

            <div>
              <label htmlFor="new-password" className="admin-label">
                Password
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={12}
                value={newPassword}
                placeholder="$ecretPass123"
                onChange={(e) => setNewPassword(e.target.value)}
                className="admin-input"
                disabled={creating}
              />
              <p className="admin-hint">Minimum 12 characters</p>
            </div>

            <div>
              <label htmlFor="new-display-name" className="admin-label">
                Display Name (Optional)
              </label>
              <input
                id="new-display-name"
                type="text"
                value={newDisplayName}
                placeholder="John Doe"
                onChange={(e) => setNewDisplayName(e.target.value)}
                className="admin-input"
                disabled={creating}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating}
                className="admin-btn admin-btn-primary"
              >
                {creating ? 'Creating...' : 'Create Admin'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewEmail('');
                  setNewPassword('');
                  setNewDisplayName('');
                  setError('');
                }}
                disabled={creating}
                className="admin-btn admin-btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <section className="admin-card">
        {/* Table, md and up */}
        <div className="hidden md:block">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Display Name</th>
                <th scope="col">Role</th>
                <th scope="col">Created</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="text-copy">{user.email}</td>
                  <td className="text-copy-muted">
                    {user.display_name || <span className="italic text-copy-muted opacity-70">Not set</span>}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        user.role === 'master' ? 'status-badge-master' : 'status-badge-admin'
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="admin-mono-meta whitespace-nowrap">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td>{renderDeleteButton(user)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Stacked cards, below md */}
        <div className="flex flex-col gap-4 md:hidden">
          {users.map((user) => (
            <div key={user.id} className="rounded-[var(--radius-panel)] border border-rail p-4">
              <p className="text-copy">{user.email}</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="portal-label text-copy-muted">Display Name</dt>
                  <dd className="mt-0.5 text-copy-muted">
                    {user.display_name || 'Not set'}
                  </dd>
                </div>
                <div>
                  <dt className="portal-label text-copy-muted">Role</dt>
                  <dd className="mt-1">
                    <span
                      className={`status-badge ${
                        user.role === 'master' ? 'status-badge-master' : 'status-badge-admin'
                      }`}
                    >
                      {user.role}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="portal-label text-copy-muted">Created</dt>
                  <dd className="admin-mono-meta mt-0.5">
                    {new Date(user.created_at).toLocaleDateString()}
                  </dd>
                </div>
              </dl>
              {renderDeleteButton(user) && (
                <div className="mt-4 border-t border-rail pt-3">
                  {renderDeleteButton(user)}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
