import { stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configFilePath, readConfigFile } from '../src/config';
import { MAX_IMAGE_BYTES } from '../src/images';
import { makeFetch, makeHarness, makeTempDir, response, writeTempFile } from './helpers';

const ENV = { PAWPRESS_URL: 'https://site.example', PAWPRESS_TOKEN: 'pp_test_token' };
const POST_ID = '11111111-1111-1111-1111-111111111111';
const CATEGORY_ID = '22222222-2222-2222-2222-222222222222';

describe('destructive commands', () => {
  it('posts delete without --yes is a usage error and makes no request', async () => {
    const harness = makeFetch(() => response(200, { deleted: true, id: POST_ID }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'delete', POST_ID])).toBe(2);
    expect(h.stderrText()).toMatch(/--yes/);
    expect(harness.calls).toHaveLength(0);
  });

  it('posts delete --yes --dry-run prints a DELETE plan without a request', async () => {
    const harness = makeFetch(() => response(200, { deleted: true, id: POST_ID }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'delete', POST_ID, '--yes', '--dry-run', '--json'])).toBe(0);
    expect(harness.calls).toHaveLength(0);
    const doc = JSON.parse(h.stdoutText()) as { requests: Array<{ method: string }> };
    expect(doc.requests[0]?.method).toBe('DELETE');
  });

  it('posts delete --yes performs the request', async () => {
    const harness = makeFetch(() => response(200, { deleted: true, id: POST_ID }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'delete', POST_ID, '--yes', '--json'])).toBe(0);
    expect(harness.methods()).toEqual(['DELETE']);
  });

  it('categories delete without --yes is a usage error', async () => {
    const harness = makeFetch(() => response(200, { deleted: true, id: CATEGORY_ID }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['categories', 'delete', CATEGORY_ID])).toBe(2);
    expect(harness.calls).toHaveLength(0);
  });
});

describe('uuid validation', () => {
  it('posts update rejects a non-uuid id without a request', async () => {
    const harness = makeFetch(() => response(200, {}));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'update', 'not-a-uuid', '--title', 'X'])).toBe(2);
    expect(h.stderrText()).toMatch(/expected a UUID/);
    expect(harness.calls).toHaveLength(0);
  });

  it('posts publish rejects a path-traversal id', async () => {
    const harness = makeFetch(() => response(200, {}));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'publish', '../categories/x'])).toBe(2);
    expect(harness.calls).toHaveLength(0);
  });

  it('posts delete rejects a non-uuid id before --yes handling', async () => {
    const harness = makeFetch(() => response(200, { deleted: true, id: 'x' }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'delete', 'not-a-uuid', '--yes'])).toBe(2);
    expect(harness.calls).toHaveLength(0);
  });

  it('categories update and delete reject non-uuid ids', async () => {
    const harness = makeFetch(() => response(200, {}));
    const update = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await update.run(['categories', 'update', 'nope', '--name', 'X'])).toBe(2);
    const remove = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await remove.run(['categories', 'delete', 'nope', '--yes'])).toBe(2);
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
    expect(await h.run(['posts', 'update', POST_ID, '--title', 'X', '--dry-run', '--json'])).toBe(0);
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

  it('rejects a symlinked file before any request', async () => {
    const dir = await makeTempDir();
    await writeTempFile(dir, 'real.png', 'PNGDATA');
    await symlink(join(dir, 'real.png'), join(dir, 'link.png'));
    const harness = makeFetch(() => response(201, { url: 'https://cdn/x' }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['media', 'upload', join(dir, 'link.png')])).toBe(2);
    expect(h.stderrText()).toMatch(/symbolic link/);
    expect(harness.calls).toHaveLength(0);
  });

  it('rejects a file over 4 MB before any request', async () => {
    const dir = await makeTempDir();
    const path = join(dir, 'big.png');
    await writeFile(path, Buffer.alloc(MAX_IMAGE_BYTES + 1));
    const harness = makeFetch(() => response(201, { url: 'https://cdn/x' }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['media', 'upload', path])).toBe(6);
    expect(h.stderrText()).toMatch(/too large/);
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
