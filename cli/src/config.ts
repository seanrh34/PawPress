import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { usageError } from './errors';

export interface Env {
  [key: string]: string | undefined;
}

export interface ConfigFile {
  url?: string;
  token?: string;
}

export function configDir(env: Env, home: string): string {
  const xdg = env.XDG_CONFIG_HOME?.trim();
  const base = xdg && xdg.length > 0 ? xdg : join(home, '.config');
  return join(base, 'pawpress');
}

export function configFilePath(env: Env, home: string): string {
  return join(configDir(env, home), 'config.json');
}

export async function readConfigFile(path: string): Promise<ConfigFile> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return {};
    throw error;
  }
  if (!raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw usageError(`invalid config file at ${path}`);
  }
  if (!isRecord(parsed)) return {};
  const config: ConfigFile = {};
  if (typeof parsed.url === 'string') config.url = parsed.url;
  if (typeof parsed.token === 'string') config.token = parsed.token;
  return config;
}

export async function writeConfigFile(path: string, config: ConfigFile): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
  await chmod(dir, 0o700).catch(() => undefined);
}

export async function patchConfigFile(path: string, patch: ConfigFile): Promise<ConfigFile> {
  const current = await readConfigFile(path);
  const merged: ConfigFile = { ...current, ...patch };
  await writeConfigFile(path, merged);
  return merged;
}

export async function removeConfigToken(path: string): Promise<ConfigFile> {
  const current = await readConfigFile(path);
  const next: ConfigFile = { ...current };
  delete next.token;
  await writeConfigFile(path, next);
  return next;
}

export function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw usageError(`invalid URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw usageError('URL must use http or https');
  }
  if (url.protocol === 'http:' && !isLocalHost(url.hostname)) {
    throw usageError('http:// is only allowed for localhost; use https for remote sites');
  }
  const value = url.toString();
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function isLocalHost(host: string): boolean {
  const normalized = host.replace(/^\[/, '').replace(/\]$/, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function parseHeaders(raw: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!raw) return headers;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const index = line.indexOf(':');
    if (index <= 0) {
      throw usageError('invalid PAWPRESS_HEADERS entry (expected "Name: value")');
    }
    const name = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (name) headers[name] = value;
  }
  return headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isErrnoException(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && 'code' in value;
}
