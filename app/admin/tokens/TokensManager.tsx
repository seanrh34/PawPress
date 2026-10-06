'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading tokens...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 text-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">API Tokens</h1>
            <p className="mt-2 text-gray-600">
              Create personal access tokens for AI agents using the pawpress CLI. Revoke
              any token you no longer trust.
            </p>
          </div>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>

        {/* List error */}
        {listError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{listError}</p>
          </div>
        )}

        {/* Created token panel */}
        {createdToken ? (
          <div className="mb-8 bg-white rounded-lg shadow p-6 border-2 border-green-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Token created</h2>
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-800 font-medium">
                Copy this token now. For security it will not be shown again.
              </p>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your new token
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={createdToken}
                onFocus={(e) => e.target.select()}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm bg-gray-50"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="mt-6">
              <p className="block text-sm font-medium text-gray-700 mb-2">
                Give it to the agent and log it in with:
              </p>
              <pre className="px-4 py-3 bg-gray-900 text-gray-100 rounded-lg font-mono text-sm overflow-x-auto">
                {usageSnippet}
              </pre>
            </div>

            <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleDone}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Create form */
          <div className="mb-8 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create a token</h2>
            <form onSubmit={handleCreate} className="space-y-6">
              {createError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800">{createError}</p>
                </div>
              )}

              {/* Name */}
              <div>
                <label
                  htmlFor="token-name"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Name *
                </label>
                <input
                  type="text"
                  id="token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Content agent, Laptop CLI"
                />
                {fieldErrors.name && (
                  <p className="mt-1 text-sm text-red-600">{fieldErrors.name[0]}</p>
                )}
              </div>

              {/* Scopes */}
              <fieldset>
                <legend className="block text-sm font-medium text-gray-700 mb-2">
                  Scopes *
                </legend>
                <div className="space-y-3">
                  {SCOPE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-start gap-3 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={scopes.has(option.value)}
                        onChange={() => toggleScope(option.value)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-900 font-mono">
                          {option.value}
                        </span>
                        <span className="block text-sm text-gray-500">
                          {option.description}
                        </span>
                        {option.warning && (
                          <span className="block text-xs text-amber-600 mt-0.5">
                            {option.warning}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                {fieldErrors.scopes && (
                  <p className="mt-2 text-sm text-red-600">{fieldErrors.scopes[0]}</p>
                )}
              </fieldset>

              {/* Expiry */}
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-2">
                  Expires in *
                </span>
                <div className="flex gap-6">
                  {EXPIRY_CHOICES.map((days) => (
                    <label
                      key={days}
                      className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="expires_in_days"
                        value={days}
                        checked={expiresInDays === days}
                        onChange={() => setExpiresInDays(days)}
                        className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {days} days
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Short-lived tokens are safer. Tokens can last at most 90 days.
                </p>
                {fieldErrors.expires_in_days && (
                  <p className="mt-1 text-sm text-red-600">
                    {fieldErrors.expires_in_days[0]}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={isCreating}
                >
                  Reset
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? 'Creating...' : 'Create Token'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Token list */}
        {tokens.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">
              No API tokens yet. Create one above to let an AI agent connect.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Scopes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tokens.map((token) => {
                  const soon = isExpiringSoon(token.expires_at);
                  return (
                    <tr key={token.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {token.name}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {token.scopes.map((scope) => (
                            <span
                              key={scope}
                              className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 font-mono"
                            >
                              {scope}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatAbsolute(token.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div
                          className={`text-sm ${
                            soon ? 'font-semibold text-amber-600' : 'text-gray-500'
                          }`}
                        >
                          {formatRelative(token.expires_at)}
                        </div>
                        <div
                          className={`text-xs ${
                            soon ? 'text-amber-600' : 'text-gray-400'
                          }`}
                        >
                          {formatAbsolute(token.expires_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleRevoke(token.id, token.name)}
                          disabled={revokingId === token.id}
                          className="text-red-600 hover:text-red-900 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
        )}
      </div>
    </div>
  );
}
