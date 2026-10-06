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

export interface FakeQuery extends PromiseLike<FakeResult> {
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

export interface RecordedUpload {
  bucket: string;
  path: string;
  options: unknown;
}

export interface FakeDb {
  client: SupabaseClient;
  calls: RecordedCall[];
  uploads: RecordedUpload[];
  setUploadResult(result: FakeResult): void;
  callsFor(table: string, method: string): RecordedCall[];
}

/**
 * Minimal in-memory stand-in for a Supabase client. Each table has its own FIFO
 * queue of results consumed by terminal calls (`single`, `maybeSingle`, or
 * awaiting the builder). Chain methods are recorded so tests can assert on the
 * queries the services build.
 */
export function makeDb(queue: Record<string, FakeResult[]> = {}): FakeDb {
  const calls: RecordedCall[] = [];
  const remaining = new Map<string, FakeResult[]>();
  for (const [table, results] of Object.entries(queue)) {
    remaining.set(table, [...results]);
  }

  const uploads: RecordedUpload[] = [];
  let uploadResult: FakeResult = {
    data: { path: 'generated.png' },
    error: null,
  };

  function take(table: string): FakeResult {
    const list = remaining.get(table);
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

  const client = {
    from(table: string): FakeQuery {
      return makeChain(table);
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

  return {
    client,
    calls,
    uploads,
    setUploadResult(result: FakeResult) {
      uploadResult = result;
    },
    callsFor(table: string, method: string) {
      return calls.filter((call) => call.table === table && call.method === method);
    },
  };
}
