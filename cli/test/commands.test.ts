import { stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { configFilePath, readConfigFile } from '../src/config';
import { makeFetch, makeHarness, makeTempDir, response } from './helpers';

const ENV = { PAWPRESS_URL: 'https://site.example', PAWPRESS_TOKEN: 'pp_test_token' };

describe('destructive commands', () => {
  it('posts delete without --yes is a usage error and makes no request', async () => {
    const harness = makeFetch(() => response(200, { deleted: true, id: 'p1' }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'delete', 'p1'])).toBe(2);
    expect(h.stderrText()).toMatch(/--yes/);
    expect(harness.calls).toHaveLength(0);
  });

  it('posts delete --yes --dry-run prints a DELETE plan without a request', async () => {
    const harness = makeFetch(() => response(200, { deleted: true, id: 'p1' }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'delete', 'p1', '--yes', '--dry-run', '--json'])).toBe(0);
    expect(harness.calls).toHaveLength(0);
    const doc = JSON.parse(h.stdoutText()) as { requests: Array<{ method: string }> };
    expect(doc.requests[0]?.method).toBe('DELETE');
  });

  it('posts delete --yes performs the request', async () => {
    const harness = makeFetch(() => response(200, { deleted: true, id: 'p1' }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'delete', 'p1', '--yes', '--json'])).toBe(0);
    expect(harness.methods()).toEqual(['DELETE']);
  });

  it('categories delete without --yes is a usage error', async () => {
    const harness = makeFetch(() => response(200, { deleted: true, id: 'c1' }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['categories', 'delete', 'c1'])).toBe(2);
    expect(harness.calls).toHaveLength(0);
  });
});

describe('dry-run does not mutate', () => {
  it('posts create --dry-run sends no request', async () => {
    const harness = makeFetch(() => response(201, {}));
    const h = makeHarness({ env: ENV, fetch: harness.fetch, stdin: async () => 'Body' });
    expect(
      await h.run(['posts', 'create', '--title', 'T', '--category', 'news', '--stdin', '--dry-run', '--json']),
    ).toBe(0);
    expect(harness.calls).toHaveLength(0);
    expect(JSON.parse(h.stdoutText())).toMatchObject({ dry_run: true });
  });

  it('posts update --dry-run sends no request', async () => {
    const harness = makeFetch(() => response(200, {}));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'update', 'p1', '--title', 'X', '--dry-run', '--json'])).toBe(0);
    expect(harness.calls).toHaveLength(0);
  });
});

describe('media upload', () => {
  it('rejects unsupported extensions before any request', async () => {
    const dir = await makeTempDir();
    const path = `${dir}/bad.bmp`;
    const harness = makeFetch(() => response(201, { url: 'https://cdn/x' }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['media', 'upload', path])).toBe(2);
    expect(harness.calls).toHaveLength(0);
  });
});

describe('auth', () => {
  it('login validates via /me, saves the token with mode 0600 and never prints it', async () => {
    const dir = await makeTempDir();
    const env = { XDG_CONFIG_HOME: dir };
    const me = {
      user: { id: 'u1', email: 'a@b.c', role: 'admin' },
      token: { id: 't1', name: 'agent', scopes: ['posts:read', 'media:upload'], expires_at: '2026-11-01T00:00:00.000Z' },
    };
    const harness = makeFetch(() => response(200, me));
    const h = makeHarness({
      env,
      fetch: harness.fetch,
      stdin: async () => 'pp_SECRET_TOKEN\n',
    });

    expect(await h.run(['auth', 'login', '--url', 'https://site.example/'])).toBe(0);
    expect(h.stdoutText()).toMatch(/a@b\.c/);
    expect(h.stdoutText()).not.toMatch(/pp_SECRET_TOKEN/);

    const file = configFilePath(env, '/home/test');
    expect(await readConfigFile(file)).toEqual({ url: 'https://site.example', token: 'pp_SECRET_TOKEN' });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it('login fails fast when stdin is empty', async () => {
    const dir = await makeTempDir();
    const harness = makeFetch(() => response(200, {}));
    const h = makeHarness({ env: { XDG_CONFIG_HOME: dir }, fetch: harness.fetch, stdin: async () => '  \n' });
    expect(await h.run(['auth', 'login', '--url', 'https://site.example'])).toBe(2);
    expect(harness.calls).toHaveLength(0);
  });

  it('logout removes the token but keeps the url', async () => {
    const dir = await makeTempDir();
    const env = { XDG_CONFIG_HOME: dir };
    const me = {
      user: { id: 'u1', email: 'a@b.c', role: 'admin' },
      token: { id: 't1', name: 'agent', scopes: [], expires_at: '2026-11-01T00:00:00.000Z' },
    };
    const loginFetch = makeFetch(() => response(200, me));
    const login = makeHarness({ env, fetch: loginFetch.fetch, stdin: async () => 'pp_x' });
    await login.run(['auth', 'login', '--url', 'https://site.example']);

    const h = makeHarness({ env, fetch: async () => response(200, {}) });
    expect(await h.run(['auth', 'logout'])).toBe(0);
    const file = configFilePath(env, '/home/test');
    expect(await readConfigFile(file)).toEqual({ url: 'https://site.example' });
  });
});
