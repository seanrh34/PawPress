import { describe, expect, it } from 'vitest';
import { makeFetch, makeHarness, response } from './helpers';

const ENV = { PAWPRESS_URL: 'https://site.example', PAWPRESS_TOKEN: 'pp_test_token' };

function post(): Record<string, unknown> {
  return {
    id: 'p1',
    title: 'Hello',
    slug: 'hello',
    excerpt: '',
    status: 'draft',
    published_at: null,
    category: { id: 'c1', slug: 'news', name: 'News' },
    featured_image_url: null,
    created_at: '2026-10-06T12:00:00.000Z',
    updated_at: '2026-10-06T12:00:00.000Z',
    content: '# Hello',
    content_format: 'markdown',
  };
}

function parseSingleJson(text: string): unknown {
  const trimmed = text.trim();
  expect(trimmed.split('\n')).toHaveLength(1);
  return JSON.parse(trimmed);
}

describe('--json output', () => {
  it('posts list prints one JSON document on stdout and nothing on stderr', async () => {
    const harness = makeFetch(() => response(200, { items: [post()], total: 1 }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'list', '--json'])).toBe(0);
    expect(parseSingleJson(h.stdoutText())).toEqual({ items: [post()], total: 1 });
    expect(h.stderrText()).toBe('');
  });

  it('posts get prints the full post', async () => {
    const harness = makeFetch(() => response(200, post()));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'get', 'p1', '--json'])).toBe(0);
    expect(parseSingleJson(h.stdoutText())).toMatchObject({ id: 'p1', content: '# Hello' });
  });

  it('auth status prints the me response', async () => {
    const me = {
      user: { id: 'u1', email: 'a@b.c', role: 'admin' },
      token: { id: 't1', name: 'agent', scopes: ['posts:read'], expires_at: '2026-11-01T00:00:00.000Z' },
    };
    const harness = makeFetch(() => response(200, me));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['auth', 'status', '--json'])).toBe(0);
    expect(parseSingleJson(h.stdoutText())).toEqual(me);
  });

  it('respects PAWPRESS_OUTPUT=json', async () => {
    const harness = makeFetch(() => response(200, { items: [], total: 0 }));
    const h = makeHarness({ env: { ...ENV, PAWPRESS_OUTPUT: 'json' }, fetch: harness.fetch });
    expect(await h.run(['posts', 'list'])).toBe(0);
    expect(parseSingleJson(h.stdoutText())).toEqual({ items: [], total: 0 });
  });

  it('errors go to stderr as JSON with empty stdout', async () => {
    const harness = makeFetch(() =>
      response(400, { error: { code: 'validation_failed', message: 'bad', details: { fields: { title: ['Required'] } } } }),
    );
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'list', '--json'])).toBe(6);
    expect(h.stdoutText()).toBe('');
    const parsed = JSON.parse(h.stderrText()) as { error: Record<string, unknown> };
    expect(parsed.error.message).toBe('bad');
    expect(parsed.error.code).toBe('validation_failed');
    expect(parsed.error.details).toEqual({ fields: { title: ['Required'] } });
  });

  it('reports validation field details in human mode', async () => {
    const harness = makeFetch(() =>
      response(400, { error: { code: 'validation_failed', message: 'bad', details: { fields: { title: ['Required'] } } } }),
    );
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'list'])).toBe(6);
    expect(h.stderrText()).toMatch(/error: bad/);
    expect(h.stderrText()).toMatch(/title: Required/);
  });

  it('dry-run prints a single JSON plan document', async () => {
    const harness = makeFetch(() => response(201, {}));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['categories', 'create', '--name', 'N', '--slug', 'n', '--description', 'd', '--dry-run', '--json'])).toBe(0);
    expect(harness.calls).toHaveLength(0);
    const doc = parseSingleJson(h.stdoutText()) as { dry_run: boolean; requests: unknown[] };
    expect(doc.dry_run).toBe(true);
    expect(doc.requests).toHaveLength(1);
  });
});
