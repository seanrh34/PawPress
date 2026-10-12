import { readFileSync } from 'node:fs';
import { configFilePath, normalizeBaseUrl, parseHeaders, readConfigFile } from './config';
import type { Env } from './config';
import { usageError } from './errors';
import { ApiClient } from './http';
import type { CliDeps, GlobalFlags } from './deps';
import type { Output } from './output';

export interface Context {
  deps: CliDeps;
  out: Output;
  globals: GlobalFlags;
}

export interface Settings {
  url?: string;
  token?: string;
  headers: Record<string, string>;
}

export interface Runtime {
  url: string;
  token: string;
  headers: Record<string, string>;
}

export async function resolveSettings(ctx: Context): Promise<Settings> {
  const { deps, globals } = ctx;
  const file = await readConfigFile(configFilePath(deps.env, deps.homedir));
  const url = globals.url ?? deps.env.PAWPRESS_URL ?? file.url;
  const token = globals.token ?? deps.env.PAWPRESS_TOKEN ?? file.token;
  const headers = parseHeaders(deps.env.PAWPRESS_HEADERS);
  return { url, token, headers };
}

export async function resolveRuntime(
  ctx: Context,
  options: { requireUrl?: boolean; requireToken?: boolean } = {},
): Promise<Runtime> {
  const { requireUrl = true, requireToken = true } = options;
  const settings = await resolveSettings(ctx);
  let url = settings.url;
  if (requireUrl) {
    if (!url || !url.trim()) {
      throw usageError('no site URL configured; pass --url or set PAWPRESS_URL');
    }
    url = normalizeBaseUrl(url);
  }
  if (requireToken) {
    if (!settings.token || !settings.token.trim()) {
      throw usageError(
        'no API token configured; run `pawpress auth login --url <site>` or set PAWPRESS_TOKEN',
      );
    }
  }
  return { url: url ?? '', token: settings.token ?? '', headers: settings.headers };
}

export async function makeClient(ctx: Context): Promise<ApiClient> {
  const runtime = await resolveRuntime(ctx);
  return new ApiClient({
    baseUrl: runtime.url,
    token: runtime.token,
    headers: runtime.headers,
    fetch: ctx.deps.fetch,
    version: ctx.deps.version,
  });
}

export function collectSecrets(env: Env, home: string, globals: GlobalFlags): string[] {
  const secrets: string[] = [];
  if (globals.token) secrets.push(globals.token);
  if (env.PAWPRESS_TOKEN) secrets.push(env.PAWPRESS_TOKEN);
  try {
    for (const value of Object.values(parseHeaders(env.PAWPRESS_HEADERS))) {
      secrets.push(value);
    }
  } catch {
    // Invalid header config is reported when the request runtime resolves.
  }
  try {
    const raw = readFileSync(configFilePath(env, home), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { token?: unknown }).token === 'string'
    ) {
      secrets.push((parsed as { token: string }).token);
    }
  } catch {
    // No readable config file: nothing to add.
  }
  return secrets;
}
