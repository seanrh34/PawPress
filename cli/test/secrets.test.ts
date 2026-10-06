import { describe, expect, it } from 'vitest';
import { makeFetch, makeHarness, makeTempDir, response, writeTempFile } from './helpers';

const TOKEN = 'pp_SECRET_TEST_TOKEN';
const BYPASS = 'BYPASS_SECRET_VALUE';
const ENV = {
  PAWPRESS_URL: 'https://site.example',
  PAWPRESS_TOKEN: TOKEN,
  PAWPRESS_HEADERS: `x-vercel-protection-bypass: ${BYPASS}`,
};

function assertNoSecrets(text: string): void {
  expect(text).not.toContain(TOKEN);
  expect(text).not.toContain(BYPASS);
}

async function runAndCollect(
  argv: string[],
  handler: Parameters<typeof makeFetch>[0],
  extra: Partial<Parameters<typeof makeHarness>[0]> = {},
): Promise<{ combined: string; stdout: string; stderr: string }> {
  const harness = makeFetch(handler);
  const h = makeHarness({ env: ENV, fetch: harness.fetch, ...extra });
  await h.run(argv);
  const stdout = h.stdoutText();
  const stderr = h.stderrText();
  assertNoSecrets(stdout);
  assertNoSecrets(stderr);
  assertNoSecrets(stdout + stderr);
  return { combined: stdout + stderr, stdout, stderr };
}

const item = {
  id: 'p1',
  title: 'Hello',
  slug: 'hello',
  excerpt: '',
  status: 'draft',
  published_at: null,
  category: null,
  featured_image_url: null,
  created_at: '2026-10-06T12:00:00.000Z',
  updated_at: '2026-10-06T12:00:00.000Z',
};

describe('secret hygiene', () => {
  it('never leaks the token or header value on success', async () => {
    const harness = makeFetch((_url, init) => {
      expect(init?.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(init?.headers?.['x-vercel-protection-bypass']).toBe(BYPASS);
      return response(200, { items: [item], total: 1 });
    });
    const out: string[] = [];
    const err: string[] = [];
    const h = makeHarness({
      env: ENV,
      fetch: harness.fetch,
      stdout: (s) => out.push(s),
      stderr: (s) => err.push(s),
    });
    await h.run(['posts', 'list']);
    assertNoSecrets(out.join(''));
    assertNoSecrets(err.join(''));
  });

  it('never leaks secrets in a 401 error', async () => {
    await runAndCollect(['posts', 'list'], () =>
      response(401, { error: { code: 'unauthorized', message: 'bad token ' + TOKEN } }),
    );
  });

  it('never leaks secrets in a 500 error', async () => {
    await runAndCollect(['posts', 'list'], () =>
      response(500, { error: { code: 'internal', message: 'oops ' + BYPASS } }),
    );
  });

  it('never leaks secrets on a network failure', async () => {
    await runAndCollect(['posts', 'list'], () => {
      throw new Error(`connect failed for ${TOKEN}`);
    });
  });

  it('never leaks secrets in JSON error mode', async () => {
    await runAndCollect(['posts', 'list', '--json'], () =>
      response(403, { error: { code: 'forbidden', message: `denied ${TOKEN} ${BYPASS}` } }),
    );
  });

  it('never leaks secrets from a dry-run push', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(dir, 'post.md', '---\ntitle: X\ncategory: news\n---\nBody');
    await runAndCollect(['posts', 'push', file, '--dry-run'], () => response(201, {}), { cwd: dir });
  });

  it('never leaks secrets on auth status', async () => {
    await runAndCollect(['auth', 'status'], () =>
      response(200, {
        user: { id: 'u1', email: 'a@b.c', role: 'admin' },
        token: { id: 't1', name: 'agent', scopes: ['posts:read'], expires_at: 'x' },
      }),
    );
  });

  it('never leaks the token read from stdin during auth login', async () => {
    const dir = await makeTempDir();
    const out: string[] = [];
    const err: string[] = [];
    const harness = makeFetch(() =>
      response(200, {
        user: { id: 'u1', email: 'a@b.c', role: 'admin' },
        token: { id: 't1', name: 'agent', scopes: [], expires_at: 'x' },
      }),
    );
    const h = makeHarness({
      env: { XDG_CONFIG_HOME: dir, PAWPRESS_HEADERS: `x-vercel-protection-bypass: ${BYPASS}` },
      fetch: harness.fetch,
      stdin: async () => `${TOKEN}\n`,
      stdout: (s) => out.push(s),
      stderr: (s) => err.push(s),
    });
    await h.run(['auth', 'login', '--url', 'https://site.example']);
    assertNoSecrets(out.join(''));
    assertNoSecrets(err.join(''));
  });
});
