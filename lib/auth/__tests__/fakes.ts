import type { SupabaseClient } from '@supabase/supabase-js';

export interface FakeAuthUser {
  id: string;
  email: string | null;
  app_metadata: Record<string, unknown>;
  banned_until?: string | null;
  deleted_at?: string | null;
}

export interface FakeAdminState {
  users: Map<string, FakeAuthUser>;
  profiles: Map<string, { role: unknown }>;
  updates: { id: string; app_metadata: Record<string, unknown> }[];
}

export interface FakeAdmin {
  client: SupabaseClient;
  state: FakeAdminState;
}

function cloneUser(user: FakeAuthUser): FakeAuthUser {
  return {
    ...user,
    app_metadata: { ...user.app_metadata },
  };
}

interface ProfileQuery {
  select(columns?: unknown): ProfileQuery;
  eq(column: unknown, value: string): ProfileQuery;
  maybeSingle(): Promise<{ data: { role: unknown } | null; error: null }>;
}

/**
 * Minimal hand-written stand-in for the Supabase admin client: enough of
 * `auth.admin` and the `user_profiles` read path for token storage and auth.
 */
export function makeFakeAdmin(init?: {
  users?: Map<string, FakeAuthUser>;
  profiles?: Map<string, { role: unknown }>;
}): FakeAdmin {
  const state: FakeAdminState = {
    users: init?.users ?? new Map(),
    profiles: init?.profiles ?? new Map(),
    updates: [],
  };

  const client = {
    auth: {
      admin: {
        async getUserById(id: string) {
          const user = state.users.get(id);
          if (!user) {
            return { data: { user: null }, error: { message: 'User not found' } };
          }
          return { data: { user: cloneUser(user) }, error: null };
        },
        async updateUserById(
          id: string,
          attrs: { app_metadata?: Record<string, unknown> },
        ) {
          const user = state.users.get(id);
          if (!user) {
            return { data: { user: null }, error: { message: 'User not found' } };
          }
          const next: FakeAuthUser = {
            ...user,
            app_metadata: attrs.app_metadata
              ? { ...attrs.app_metadata }
              : { ...user.app_metadata },
          };
          state.users.set(id, next);
          state.updates.push({ id, app_metadata: next.app_metadata });
          return { data: { user: cloneUser(next) }, error: null };
        },
      },
    },
    from(table: string) {
      if (table !== 'user_profiles') {
        throw new Error(`Unexpected table in fake admin: ${table}`);
      }

      let id: string | undefined;
      const query: ProfileQuery = {
        select() {
          return query;
        },
        eq(_column, value) {
          id = value;
          return query;
        },
        async maybeSingle() {
          const profile = id ? state.profiles.get(id) : undefined;
          return { data: profile ? { ...profile } : null, error: null };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;

  return { client, state };
}

/**
 * Minimal stand-in for the cookie-session Supabase client used by
 * `getSessionAuth`.
 */
export function makeFakeSessionClient(options: {
  userId: string | null;
  email?: string | null;
  role?: unknown;
  hasProfile?: boolean;
}): SupabaseClient {
  const hasProfile = options.hasProfile ?? options.userId !== null;

  return {
    auth: {
      async getUser() {
        if (!options.userId) {
          return { data: { user: null }, error: { message: 'No session' } };
        }
        return {
          data: {
            user: {
              id: options.userId,
              email: options.email ?? 'admin@example.com',
            },
          },
          error: null,
        };
      },
    },
    from(table: string) {
      if (table !== 'user_profiles') {
        throw new Error(`Unexpected table in fake session client: ${table}`);
      }

      const query: ProfileQuery = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        async maybeSingle() {
          return {
            data: hasProfile ? { role: options.role ?? 'admin' } : null,
            error: null,
          };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}
