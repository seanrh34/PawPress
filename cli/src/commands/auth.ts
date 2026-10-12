import {
  configFilePath,
  normalizeBaseUrl,
  parseHeaders,
  patchConfigFile,
  removeConfigToken,
} from '../config';
import { usageError } from '../errors';
import { ApiClient } from '../http';
import { parseOptions } from '../args';
import { makeClient, resolveRuntime } from '../runtime';
import type { Context } from '../runtime';
import type { MeResponse } from '../types';

export async function authCommand(ctx: Context, args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'login':
      return authLogin(ctx, rest);
    case 'status':
      return authStatus(ctx, rest);
    case 'logout':
      return authLogout(ctx, rest);
    case undefined:
      throw usageError('auth requires a subcommand: login, status or logout');
    default:
      throw usageError(`unknown auth subcommand: ${sub}`);
  }
}

async function authLogin(ctx: Context, args: string[]): Promise<void> {
  const { deps, out } = ctx;
  parseOptions(args, {}, false);

  const url = ctx.globals.url ?? deps.env.PAWPRESS_URL;
  if (!url || !url.trim()) {
    throw usageError('auth login requires --url <site>');
  }
  const token = (await deps.stdin()).trim();
  if (!token) {
    throw usageError('no token provided on stdin');
  }

  const baseUrl = normalizeBaseUrl(url);
  const client = new ApiClient({
    baseUrl,
    token,
    headers: parseHeaders(deps.env.PAWPRESS_HEADERS),
    fetch: deps.fetch,
    version: deps.version,
  });
  const me = await client.request<MeResponse>({ method: 'GET', path: '/api/v1/me' });

  await patchConfigFile(configFilePath(deps.env, deps.homedir), { url: baseUrl, token });

  if (out.json) {
    out.jsonDoc(me);
    return;
  }
  out.line(`Logged in as ${me.user.email} (${me.user.role})`);
  out.line(`Token: ${me.token.name} (${me.token.id})`);
  out.line(`Scopes: ${me.token.scopes.join(', ') || '(none)'}`);
  out.line(`Expires: ${me.token.expires_at}`);
}

async function authStatus(ctx: Context, args: string[]): Promise<void> {
  const { out } = ctx;
  parseOptions(args, {}, false);
  const runtime = await resolveRuntime(ctx);
  const client = await makeClient(ctx);
  const me = await client.request<MeResponse>({ method: 'GET', path: '/api/v1/me' });

  if (out.json) {
    out.jsonDoc(me);
    return;
  }
  out.line(`Site: ${runtime.url}`);
  out.line(`User: ${me.user.email} (${me.user.role})`);
  out.line(`Token: ${me.token.name} (${me.token.id})`);
  out.line(`Scopes: ${me.token.scopes.join(', ') || '(none)'}`);
  out.line(`Expires: ${me.token.expires_at}`);
}

async function authLogout(ctx: Context, args: string[]): Promise<void> {
  const { deps, out } = ctx;
  parseOptions(args, {}, false);
  await removeConfigToken(configFilePath(deps.env, deps.homedir));
  out.note('Logged out: token removed from config.');
  if (out.json) out.jsonDoc({ logged_out: true });
}
