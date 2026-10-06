import { CliError, EXIT, exitCodeForError, exitCodeForStatus, networkError } from './errors';

export interface FetchResponseLike {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | FormData | Blob;
  redirect?: 'follow' | 'error' | 'manual';
  signal?: AbortSignal;
}

export type FetchLike = (input: string, init?: FetchInit) => Promise<FetchResponseLike>;

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
  headers?: Record<string, string>;
  fetch: FetchLike;
  version: string;
  timeoutMs?: number;
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | undefined>;
  json?: unknown;
  form?: FormData;
  auth?: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly headers: Record<string, string>;
  private readonly fetch: FetchLike;
  private readonly version: string;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.token = options.token;
    this.headers = options.headers ?? {};
    this.fetch = options.fetch;
    this.version = options.version;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': `pawpress-cli/${this.version}`,
      ...this.headers,
    };
    if (options.auth !== false && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    let body: string | FormData | undefined;
    if (options.form) {
      body = options.form;
    } else if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    }

    let response: FetchResponseLike;
    try {
      response = await this.fetch(url, {
        method: options.method,
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'request failed';
      throw networkError(`could not reach ${safeHost(url)}: ${reason}`);
    }

    if (response.status >= 300 && response.status < 400) {
      throw new CliError(
        `server responded with a redirect (HTTP ${response.status}); check the site URL`,
        EXIT.INTERNAL,
        { code: 'redirect' },
      );
    }

    const text = await response.text();
    if (!response.ok) throw apiErrorFromResponse(response.status, text);
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new CliError('server returned an invalid JSON response', EXIT.INTERNAL, {
        code: 'internal',
      });
    }
  }

  async uploadImage(blob: Blob, filename: string): Promise<unknown> {
    const form = new FormData();
    form.append('file', blob, filename);
    return this.request({ method: 'POST', path: '/api/v1/media', form });
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

export function apiErrorFromResponse(status: number, text: string): CliError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  const error = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : undefined;
  if (!error) {
    return new CliError(`HTTP ${status} from server (non-JSON response)`, exitCodeForStatus(status), {
      status,
    });
  }
  const code = typeof error.code === 'string' ? error.code : undefined;
  const message =
    typeof error.message === 'string' && error.message.length > 0
      ? error.message
      : `HTTP ${status}`;
  return new CliError(message, exitCodeForError(status, code), {
    code,
    details: error.details,
    status,
  });
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
