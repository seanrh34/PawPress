import type { SupabaseClient } from '@supabase/supabase-js';

export interface FakeResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

export interface RecordedUpload {
  bucket: string;
  path: string;
  options: unknown;
}

export interface FakeUser {
  id: string;
  email: string | null;
  app_metadata: Record<string, unknown>;
}

export interface RouteDb {
  client: SupabaseClient;
  users: Map<string, FakeUser>;
  calls: RecordedCall[];
  uploads: RecordedUpload[];
  role: unknown;
  hasProfile: boolean;
  enqueue(table: string, ...results: FakeResult[]): void;
  setUploadResult(result: FakeResult): void;
  callsFor(table: string, method: string): RecordedCall[];
}

interface FakeQuery extends PromiseLike<FakeResult> {
  select(...args: unknown[]): FakeQuery;
  insert(...args: unknown[]): FakeQuery;
  update(...args: unknown[]): FakeQuery;
  delete(...args: unknown[]): FakeQuery;
  eq(...args: unknown[]): FakeQuery;
  is(...args: unknown[]): FakeQuery;
  not(...args: unknown[]): FakeQuery;
  ilike(...args: unknown[]): FakeQuery;
  order(...args: unknown[]): FakeQuery;
  range(...args: unknown[]): FakeQuery;
  limit(...args: unknown[]): FakeQuery;
  single(): Promise<FakeResult>;
  maybeSingle(): Promise<FakeResult>;
  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?:
      | ((value: FakeResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

/**
 * A single fake Supabase client that covers everything the v1 routes touch:
 * `auth.admin.getUserById` (token store + context), `user_profiles` role lookup,
 * the `posts`/`categories` query FIFO, and the `post-images` storage bucket.
 *
 * Table results are handed out in FIFO order per table so each handler/service
 * read can be scripted. `role`/`hasProfile` drive the auth role lookup.
 */
export function makeRouteDb(): RouteDb {
  const queues = new Map<string, FakeResult[]>();
  const calls: RecordedCall[] = [];
  const uploads: RecordedUpload[] = [];
  const users = new Map<string, FakeUser>();
  let uploadResult: FakeResult = {
    data: { path: 'generated.png' },
    error: null,
  };

  function take(table: string): FakeResult {
    const list = queues.get(table);
    if (list && list.length > 0) {
      return list.shift() as FakeResult;
    }
    return { data: null, error: null };
  }

  function makeChain(table: string): FakeQuery {
    const chain: FakeQuery = {
      select(...args) {
        calls.push({ table, method: 'select', args });
        return chain;
      },
      insert(...args) {
        calls.push({ table, method: 'insert', args });
        return chain;
      },
      update(...args) {
        calls.push({ table, method: 'update', args });
        return chain;
      },
      delete(...args) {
        calls.push({ table, method: 'delete', args });
        return chain;
      },
      eq(...args) {
        calls.push({ table, method: 'eq', args });
        return chain;
      },
      is(...args) {
        calls.push({ table, method: 'is', args });
        return chain;
      },
      not(...args) {
        calls.push({ table, method: 'not', args });
        return chain;
      },
      ilike(...args) {
        calls.push({ table, method: 'ilike', args });
        return chain;
      },
      order(...args) {
        calls.push({ table, method: 'order', args });
        return chain;
      },
      range(...args) {
        calls.push({ table, method: 'range', args });
        return chain;
      },
      limit(...args) {
        calls.push({ table, method: 'limit', args });
        return chain;
      },
      single() {
        calls.push({ table, method: 'single', args: [] });
        return Promise.resolve(take(table));
      },
      maybeSingle() {
        calls.push({ table, method: 'maybeSingle', args: [] });
        return Promise.resolve(take(table));
      },
      then(onfulfilled, onrejected) {
        return Promise.resolve(take(table)).then(onfulfilled, onrejected);
      },
    };

    return chain;
  }

  const dbRef = {} as RouteDb;

  function profileChain(): FakeQuery {
    let id: string | undefined;
    const chain: FakeQuery = {
      select(...args) {
        calls.push({ table: 'user_profiles', method: 'select', args });
        return chain;
      },
      insert(...args) {
        calls.push({ table: 'user_profiles', method: 'insert', args });
        return chain;
      },
      update(...args) {
        calls.push({ table: 'user_profiles', method: 'update', args });
        return chain;
      },
      delete(...args) {
        calls.push({ table: 'user_profiles', method: 'delete', args });
        return chain;
      },
      eq(...args) {
        calls.push({ table: 'user_profiles', method: 'eq', args });
        id = args[1] as string;
        return chain;
      },
      is(...args) {
        calls.push({ table: 'user_profiles', method: 'is', args });
        return chain;
      },
      not(...args) {
        calls.push({ table: 'user_profiles', method: 'not', args });
        return chain;
      },
      ilike(...args) {
        calls.push({ table: 'user_profiles', method: 'ilike', args });
        return chain;
      },
      order(...args) {
        calls.push({ table: 'user_profiles', method: 'order', args });
        return chain;
      },
      range(...args) {
        calls.push({ table: 'user_profiles', method: 'range', args });
        return chain;
      },
      limit(...args) {
        calls.push({ table: 'user_profiles', method: 'limit', args });
        return chain;
      },
      single() {
        calls.push({ table: 'user_profiles', method: 'single', args: [] });
        return Promise.resolve(profileResult());
      },
      maybeSingle() {
        calls.push({ table: 'user_profiles', method: 'maybeSingle', args: [] });
        return Promise.resolve(profileResult());
      },
      then(onfulfilled, onrejected) {
        return Promise.resolve(profileResult()).then(onfulfilled, onrejected);
      },
    };

    function profileResult(): FakeResult {
      if (!dbRef.hasProfile || !id) {
        return { data: null, error: null };
      }
      return { data: { role: dbRef.role }, error: null };
    }

    return chain;
  }

  const client = {
    auth: {
      admin: {
        async getUserById(id: string) {
          const user = users.get(id);
          if (!user) {
            return {
              data: { user: null },
              error: { message: 'User not found' },
            };
          }
          return {
            data: { user: { ...user, app_metadata: { ...user.app_metadata } } },
            error: null,
          };
        },
        async updateUserById(
          id: string,
          attrs: { app_metadata?: Record<string, unknown> },
        ) {
          const user = users.get(id);
          if (!user) {
            return {
              data: { user: null },
              error: { message: 'User not found' },
            };
          }
          const next: FakeUser = {
            ...user,
            app_metadata: attrs.app_metadata
              ? { ...attrs.app_metadata }
              : { ...user.app_metadata },
          };
          users.set(id, next);
          return {
            data: { user: { ...next, app_metadata: { ...next.app_metadata } } },
            error: null,
          };
        },
      },
    },
    from(table: string): FakeQuery {
      return table === 'user_profiles' ? profileChain() : makeChain(table);
    },
    storage: {
      from(bucket: string) {
        return {
          upload(path: string, _body: unknown, options: unknown) {
            uploads.push({ bucket, path, options });
            return Promise.resolve(uploadResult);
          },
          getPublicUrl(path: string) {
            return {
              data: { publicUrl: `https://cdn.test/${bucket}/${path}` },
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  return Object.assign(dbRef, {
    client,
    users,
    calls,
    uploads,
    role: 'admin' as unknown,
    hasProfile: true,
    enqueue(table: string, ...results: FakeResult[]) {
      const list = queues.get(table) ?? [];
      list.push(...results);
      queues.set(table, list);
    },
    setUploadResult(result: FakeResult) {
      uploadResult = result;
    },
    callsFor(table: string, method: string) {
      return calls.filter(
        (call) => call.table === table && call.method === method,
      );
    },
  });
}
