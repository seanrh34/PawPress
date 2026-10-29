'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiCopy } from 'react-icons/fi';
import PageHeader from '@/components/admin/PageHeader';

interface TokenMeta {
  id: string;
  name: string;
  scopes: string[];
  created_at: string;
  expires_at: string;
}

interface ScopeOption {
  value: string;
  description: string;
  warning?: string;
}

const SCOPE_OPTIONS: ScopeOption[] = [
  {
    value: 'posts:read',
    description: 'List and read posts, including drafts.',
  },
  {
    value: 'posts:write',
    description: 'Create posts as drafts; edit posts that are not published.',
  },
  {
    value: 'posts:publish',
    description:
      'Publish/unpublish; edit already-published posts; create with status "published".',
    warning: 'Grants publishing — only enable if you trust the agent.',
  },
  {
    value: 'posts:delete',
    description: 'Delete posts.',
    warning: 'Grants deleting — only enable if you trust the agent.',
  },
  {
    value: 'categories:write',
    description: 'Create, update and delete categories.',
  },
  {
    value: 'media:upload',
    description: 'Upload images.',
  },
];

const DEFAULT_SCOPES = ['posts:read', 'posts:write', 'media:upload'];
const EXPIRY_CHOICES = [7, 30, 90];
const DEFAULT_EXPIRY = 30;
const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

interface ApiErrorPayload {
  code: string;
  message: string;
  fields: Record<string, string[]>;
}

function parseApiError(data: unknown): ApiErrorPayload {
  const error = (data as { error?: unknown } | null)?.error;
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
    const fields: Record<string, string[]> = {};
    const details = candidate.details as { fields?: unknown } | undefined;

    if (details && typeof details.fields === 'object' && details.fields !== null) {
      for (const [key, value] of Object.entries(
        details.fields as Record<string, unknown>,
      )) {
        if (Array.isArray(value)) {
          fields[key] = value.map(String);
        }
      }
    }

    return {
      code: typeof candidate.code === 'string' ? candidate.code : 'internal',
      message:
        typeof candidate.message === 'string' ? candidate.message : 'Request failed',
      fields,
    };
  }

  return { code: 'internal', message: 'Request failed', fields: {} };
}

function createErrorMessage(payload: ApiErrorPayload): string {
  if (payload.code === 'internal') {
    return "Token signing isn't configured — ask the site owner to set PAWPRESS_TOKEN_SECRET";
  }
  return payload.message;
}

function formatAbsolute(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRelative(iso: string): string {
  const diff = Date.parse(iso) - Date.now();
  if (!Number.isFinite(diff)) {
    return '';
  }
  if (diff <= 0) {
    return 'expired';
  }
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  if (days <= 1) {
    return 'in 1 day';
  }
  return `in ${days} days`;
}

function isExpiringSoon(iso: string): boolean {
  const diff = Date.parse(iso) - Date.now();
  return Number.isFinite(diff) && diff > 0 && diff <= EXPIRING_SOON_MS;
}

function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-rail bg-surface-subtle px-2 py-0.5 font-mono text-xs text-copy-muted">
      {scope}
    </span>
  );
}

export default function TokensManager() {
  const router = useRouter();
  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<string>>(new Set(DEFAULT_SCOPES));
  const [expiresInDays, setExpiresInDays] = useState<number>(DEFAULT_EXPIRY);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/tokens', {
        credentials: 'same-origin',
      });
      const data = await response.json();

      if (!response.ok) {
        setListError(parseApiError(data).message);
        return;
      }

      setTokens(Array.isArray(data.items) ? data.items : []);
      setListError(null);
    } catch {
      setListError('Failed to load tokens');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const resetForm = () => {
    setName('');
    setScopes(new Set(DEFAULT_SCOPES));
    setExpiresInDays(DEFAULT_EXPIRY);
    setFieldErrors({});
    setCreateError(null);
  };

  const toggleScope = (scope: string) => {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
    setFieldErrors((prev) => {
      if (!prev.scopes) {
        return prev;
      }
      const next = { ...prev };
      delete next.scopes;
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setFieldErrors({});

    if (!name.trim()) {
      setFieldErrors({ name: ['Name is required'] });
      return;
    }

    if (scopes.size === 0) {
      setFieldErrors({ scopes: ['Select at least one scope'] });
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch('/api/v1/tokens', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          scopes: [...scopes],
          expires_in_days: expiresInDays,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const payload = parseApiError(data);
        setCreateError(createErrorMessage(payload));
        setFieldErrors(payload.fields);
        return;
      }

      setCreatedToken(data.token);
      setCopied(false);
      resetForm();
      await fetchTokens();
    } catch {
      setCreateError('Failed to create token. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!createdToken) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleDone = () => {
    setCreatedToken(null);
    setCopied(false);
  };

  const handleRevoke = async (id: string, tokenName: string) => {
    if (
      !window.confirm(
        `Revoke the token "${tokenName}"? Agents using it will stop working immediately.`,
      )
    ) {
      return;
    }

    setRevokingId(id);
    try {
      const response = await fetch(`/api/v1/tokens/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const data = await response.json();

      if (!response.ok) {
        setListError(parseApiError(data).message);
        return;
      }

      await fetchTokens();
    } catch {
      setListError('Failed to revoke token');
    } finally {
      setRevokingId(null);
    }
  };

  const usageSnippet = `printf '%s' "$TOKEN" | pawpress auth login --url ${origin}`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-signal mx-auto mb-4"></div>
          <p className="text-copy-muted">Loading tokens...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="API Tokens"
        description="Create personal access tokens for AI agents using the pawpress CLI. Revoke any token you no longer trust."
        actions={
          <button
            type="button"
            onClick={() => router.push('/admin')}
            className="admin-btn admin-btn-ghost"
          >
            Back to Dashboard
          </button>
        }
      />

      {/* List error */}
      {listError && (
        <div className="admin-alert admin-alert-error mb-6">
          <p>{listError}</p>
        </div>
      )}

      {/* Created token panel */}
      {createdToken ? (
        <div className="admin-card mb-6">
          <h2 className="text-lg font-semibold">Token created</h2>
          <div className="admin-alert admin-alert-success mt-4">
            <p className="admin-alert-title">
              Copy this token now. For security it will not be shown again.
            </p>
            <div className="mt-3">
              <label htmlFor="created-token" className="admin-label">
                Your new token
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  id="created-token"
                  readOnly
                  value={createdToken}
                  onFocus={(e) => e.target.select()}
                  className="admin-input flex-1 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="admin-btn admin-btn-secondary sm:w-32"
                >
                  <FiCopy size={16} aria-hidden="true" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <p className="admin-label">Give it to the agent and log it in with:</p>
            <pre className="overflow-x-auto rounded-[var(--radius-control)] bg-[var(--ink)] px-4 py-3 font-mono text-sm text-[var(--canvas)]">
              {usageSnippet}
            </pre>
          </div>

          <div className="mt-6 flex justify-end border-t border-rail pt-4">
            <button
              type="button"
              onClick={handleDone}
              className="admin-btn admin-btn-primary"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        /* Create form */
        <div className="admin-card mb-6">
          <h2 className="text-lg font-semibold">Create a token</h2>
          <form onSubmit={handleCreate} className="mt-4 space-y-6">
            {createError && (
              <div className="admin-alert admin-alert-error">
                <p>{createError}</p>
              </div>
            )}

            {/* Name */}
            <div>
              <label htmlFor="token-name" className="admin-label">
                Name *
              </label>
              <input
                type="text"
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                className="admin-input"
                placeholder="e.g., Content agent, Laptop CLI"
              />
              {fieldErrors.name && (
                <p className="admin-error mt-1">{fieldErrors.name[0]}</p>
              )}
            </div>

            {/* Scopes */}
            <fieldset>
              <legend className="admin-label">Scopes *</legend>
              <div className="space-y-3">
                {SCOPE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-3"
                  >
                    <input
                      type="checkbox"
                      checked={scopes.has(option.value)}
                      onChange={() => toggleScope(option.value)}
                      className="form-checkbox mt-0.5"
                    />
                    <span>
                      <span className="block font-mono text-sm font-medium text-copy">
                        {option.value}
                      </span>
                      <span className="block text-sm text-copy-muted">
                        {option.description}
                      </span>
                      {option.warning && (
                        <span className="mt-0.5 block text-xs text-warning">
                          {option.warning}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              {fieldErrors.scopes && (
                <p className="admin-error mt-2">{fieldErrors.scopes[0]}</p>
              )}
            </fieldset>

            {/* Expiry */}
            <fieldset>
              <legend className="admin-label">Expires in *</legend>
              <div className="flex gap-6">
                {EXPIRY_CHOICES.map((days) => (
                  <label
                    key={days}
                    className="flex cursor-pointer items-center gap-2 text-sm text-copy"
                  >
                    <input
                      type="radio"
                      name="expires_in_days"
                      value={days}
                      checked={expiresInDays === days}
                      onChange={() => setExpiresInDays(days)}
                      className="form-checkbox"
                    />
                    {days} days
                  </label>
                ))}
              </div>
              <p className="admin-hint">
                Short-lived tokens are safer. Tokens can last at most 90 days.
              </p>
              {fieldErrors.expires_in_days && (
                <p className="admin-error mt-1">{fieldErrors.expires_in_days[0]}</p>
              )}
            </fieldset>

            <div className="flex justify-end gap-3 border-t border-rail pt-4">
              <button
                type="button"
                onClick={resetForm}
                className="admin-btn admin-btn-ghost"
                disabled={isCreating}
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="admin-btn admin-btn-primary"
              >
                {isCreating ? 'Creating...' : 'Create Token'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Token list */}
      {tokens.length === 0 ? (
        <div className="admin-card py-12 text-center">
          <p className="text-copy-muted">
            No API tokens yet. Create one above to let an AI agent connect.
          </p>
        </div>
      ) : (
        <section className="admin-card">
          {/* Table, md and up */}
          <div className="hidden md:block">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Scopes</th>
                  <th scope="col">Created</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => {
                  const soon = isExpiringSoon(token.expires_at);
                  return (
                    <tr key={token.id}>
                      <td className="font-medium text-copy">{token.name}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {token.scopes.map((scope) => (
                            <ScopeBadge key={scope} scope={scope} />
                          ))}
                        </div>
                      </td>
                      <td className="admin-mono-meta whitespace-nowrap">
                        {formatAbsolute(token.created_at)}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className={`text-sm ${soon ? 'font-semibold text-warning' : 'text-copy-muted'}`}>
                          {formatRelative(token.expires_at)}
                        </div>
                        <div className="admin-mono-meta">
                          {formatAbsolute(token.expires_at)}
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleRevoke(token.id, token.name)}
                          disabled={revokingId === token.id}
                          className="admin-btn admin-btn-ghost-danger"
                        >
                          {revokingId === token.id ? 'Revoking...' : 'Revoke'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Stacked cards, below md */}
          <div className="flex flex-col gap-4 md:hidden">
            {tokens.map((token) => {
              const soon = isExpiringSoon(token.expires_at);
              return (
                <div key={token.id} className="rounded-[var(--radius-panel)] border border-rail p-4">
                  <p className="font-medium text-copy">{token.name}</p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div>
                      <dt className="portal-label text-copy-muted">Scopes</dt>
                      <dd className="mt-1 flex flex-wrap gap-1">
                        {token.scopes.map((scope) => (
                          <ScopeBadge key={scope} scope={scope} />
                        ))}
                      </dd>
                    </div>
                    <div>
                      <dt className="portal-label text-copy-muted">Created</dt>
                      <dd className="admin-mono-meta mt-0.5">{formatAbsolute(token.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="portal-label text-copy-muted">Expires</dt>
                      <dd className={`mt-0.5 text-sm ${soon ? 'font-semibold text-warning' : 'text-copy-muted'}`}>
                        {formatRelative(token.expires_at)}
                        <span className="admin-mono-meta"> {formatAbsolute(token.expires_at)}</span>
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 border-t border-rail pt-3">
                    <button
                      type="button"
                      onClick={() => handleRevoke(token.id, token.name)}
                      disabled={revokingId === token.id}
                      className="admin-btn admin-btn-ghost-danger"
                    >
                      {revokingId === token.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
