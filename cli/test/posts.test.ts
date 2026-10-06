import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontMatter } from '../src/frontmatter';
import { MAX_IMAGE_BYTES } from '../src/images';
import { makeFetch, makeHarness, makeTempDir, response, writeTempFile } from './helpers';
import type { FetchInit } from '../src/http';

const ENV = { PAWPRESS_URL: 'https://site.example', PAWPRESS_TOKEN: 'pp_test_token' };
const POST_ID = '11111111-1111-1111-1111-111111111111';
const UPDATED = '2026-10-06T12:00:00.000Z';

function serverPost(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: POST_ID,
    title: 'Hello',
    slug: 'hello',
    excerpt: '',
    status: 'draft',
    published_at: null,
    category: { id: 'c1', slug: 'news', name: 'News' },
    featured_image_url: null,
    created_at: UPDATED,
    updated_at: UPDATED,
    ...overrides,
  };
}

function bodyOf(init: FetchInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

async function imageIn(dir: string, relative: string): Promise<string> {
  const path = join(dir, relative);
  await mkdir(join(path, '..'), { recursive: true });
  await writeTempFile(dir, relative, 'PNGDATA');
  return path;
}

describe('posts push', () => {
  it('creates a post when front matter has no id', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(dir, 'post.md', '---\ntitle: Hello\ncategory: news\n---\nBody');
    const harness = makeFetch(() => response(201, serverPost()));
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'push', file, '--json'])).toBe(0);
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.init?.method).toBe('POST');
    expect(harness.calls[0]?.url).toBe('https://site.example/api/v1/posts');
    const body = bodyOf(harness.calls[0]?.init);
    expect(body).toMatchObject({ title: 'Hello', category: 'news', status: 'draft' });
    expect(body.content_markdown).toBe('Body');
  });

  it('publishes on create when --publish or front matter status is published', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(dir, 'post.md', '---\ntitle: Hello\ncategory: news\n---\nBody');
    const harness = makeFetch(() => response(201, serverPost({ status: 'published' })));
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await h.run(['posts', 'push', file, '--publish', '--json'])).toBe(0);
    expect(bodyOf(harness.calls[0]?.init).status).toBe('published');
  });

  it('requires title and category in front matter to create', async () => {
    const dir = await makeTempDir();
    const noTitle = await writeTempFile(dir, 'a.md', '---\ncategory: news\n---\nBody');
    const noCategory = await writeTempFile(dir, 'b.md', '---\ntitle: X\n---\nBody');
    const harness = makeFetch(() => response(201, serverPost()));

    const first = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await first.run(['posts', 'push', noTitle])).toBe(2);
    const second = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await second.run(['posts', 'push', noCategory])).toBe(2);
    expect(harness.calls).toHaveLength(0);
  });

  it('updates when front matter has an id and sends if_updated_at', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(
      dir,
      'post.md',
      `---\nid: ${POST_ID}\ntitle: Changed\ncategory: news\nupdated_at: ${UPDATED}\n---\nBody`,
    );
    const harness = makeFetch(() => response(200, serverPost({ title: 'Changed' })));
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'push', file, '--json'])).toBe(0);
    expect(harness.calls[0]?.init?.method).toBe('PATCH');
    expect(harness.calls[0]?.url).toBe(`https://site.example/api/v1/posts/${POST_ID}`);
    const body = bodyOf(harness.calls[0]?.init);
    expect(body.if_updated_at).toBe(UPDATED);
    expect(body.title).toBe('Changed');
  });

  it('omits if_updated_at when --force is given', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(
      dir,
      'post.md',
      `---\nid: ${POST_ID}\ntitle: X\ncategory: news\nupdated_at: ${UPDATED}\n---\nBody`,
    );
    const harness = makeFetch(() => response(200, serverPost()));
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await h.run(['posts', 'push', file, '--force', '--json'])).toBe(0);
    expect(bodyOf(harness.calls[0]?.init).if_updated_at).toBeUndefined();
  });

  it('rejects a non-uuid front matter id before any request', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(
      dir,
      'post.md',
      `---\nid: ../categories/x\ntitle: X\ncategory: news\nupdated_at: ${UPDATED}\n---\nBody`,
    );
    const harness = makeFetch(() => response(200, serverPost()));
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await h.run(['posts', 'push', file])).toBe(2);
    expect(h.stderrText()).toMatch(/UUID/);
    expect(harness.calls).toHaveLength(0);
  });

  it('fails with exit 2 when updated_at is missing and no --force', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(dir, 'post.md', `---\nid: ${POST_ID}\ntitle: X\ncategory: news\n---\nBody`);
    const harness = makeFetch(() => response(200, serverPost()));
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await h.run(['posts', 'push', file])).toBe(2);
    expect(h.stderrText()).toMatch(/updated_at/);
    expect(harness.calls).toHaveLength(0);
  });

  it('maps a 409 conflict to exit 5 with a pull/force hint', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(
      dir,
      'post.md',
      `---\nid: ${POST_ID}\ntitle: X\ncategory: news\nupdated_at: ${UPDATED}\n---\nBody`,
    );
    const harness = makeFetch(() =>
      response(409, { error: { code: 'conflict', message: 'updated_at mismatch', details: { current_updated_at: 'x' } } }),
    );
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await h.run(['posts', 'push', file])).toBe(5);
    expect(h.stderrText()).toMatch(/pull/);
    expect(h.stderrText()).toMatch(/--force/);
  });

  it('leaves the file untouched without --write-back and rewrites it with --write-back', async () => {
    const dir = await makeTempDir();
    const original = `---\nid: ${POST_ID}\ntitle: X\ncategory: news\nupdated_at: ${UPDATED}\n---\nBody`;
    const file = await writeTempFile(dir, 'post.md', original);

    const plain = makeFetch(() => response(200, serverPost({ updated_at: '2026-10-07T00:00:00.000Z' })));
    const first = makeHarness({ env: ENV, cwd: dir, fetch: plain.fetch });
    expect(await first.run(['posts', 'push', file, '--force'])).toBe(0);
    expect(await readFile(file, 'utf8')).toBe(original);
    expect(first.stderrText()).toMatch(/stale/);

    const writeBack = makeFetch(() =>
      response(200, serverPost({ updated_at: '2026-10-07T00:00:00.000Z', slug: 'renamed' })),
    );
    const second = makeHarness({ env: ENV, cwd: dir, fetch: writeBack.fetch });
    expect(await second.run(['posts', 'push', file, '--force', '--write-back'])).toBe(0);
    const parsed = parseFrontMatter(await readFile(file, 'utf8'));
    expect(parsed.data.updated_at).toBe('2026-10-07T00:00:00.000Z');
    expect(parsed.data.slug).toBe('renamed');
    expect(parsed.body).toBe('Body');
  });
});

describe('posts push local images', () => {
  it('dry-run lists uploads and sends no requests', async () => {
    const dir = await makeTempDir();
    await imageIn(dir, 'img/a.png');
    const file = await writeTempFile(
      dir,
      'post.md',
      '---\ntitle: X\ncategory: news\nfeatured_image: img/a.png\n---\n![alt](img/a.png)',
    );
    const harness = makeFetch(() => response(201, serverPost()));
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'push', file, '--dry-run', '--json'])).toBe(0);
    expect(harness.calls).toHaveLength(0);
    const doc = JSON.parse(h.stdoutText()) as { dry_run: boolean; uploads: unknown[] };
    expect(doc.dry_run).toBe(true);
    expect(doc.uploads).toHaveLength(1);
  });

  it('uploads once, dedupes and rewrites references on create', async () => {
    const dir = await makeTempDir();
    await imageIn(dir, 'img/a.png');
    const file = await writeTempFile(
      dir,
      'post.md',
      '---\ntitle: X\ncategory: news\n---\n![one](img/a.png)\n![two](./img/a.png)',
    );
    const harness = makeFetch((url) => {
      if (url.includes('/api/v1/media')) {
        return response(201, { url: 'https://cdn.example/a.png', content_type: 'image/png', size: 5 });
      }
      return response(201, serverPost());
    });
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'push', file, '--json'])).toBe(0);
    expect(harness.methods()).toEqual(['POST', 'POST']);
    const postCall = harness.calls.find((call) => call.url.endsWith('/api/v1/posts'));
    const body = bodyOf(postCall?.init);
    expect(body.content_markdown).toBe(
      '![one](https://cdn.example/a.png)\n![two](https://cdn.example/a.png)',
    );
  });

  it('uploads and rewrites a local featured image', async () => {
    const dir = await makeTempDir();
    await imageIn(dir, 'cover.png');
    const file = await writeTempFile(
      dir,
      'post.md',
      '---\ntitle: X\ncategory: news\nfeatured_image: cover.png\n---\nBody',
    );
    const harness = makeFetch((url) => {
      if (url.includes('/api/v1/media')) {
        return response(201, { url: 'https://cdn.example/cover.png', content_type: 'image/png', size: 5 });
      }
      return response(201, serverPost());
    });
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await h.run(['posts', 'push', file, '--json'])).toBe(0);
    const postCall = harness.calls.find((call) => call.url.endsWith('/api/v1/posts'));
    expect(bodyOf(postCall?.init).featured_image_url).toBe('https://cdn.example/cover.png');
  });

  it('fails on a missing local image before any request', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(dir, 'post.md', '---\ntitle: X\ncategory: news\n---\n![a](img/missing.png)');
    const harness = makeFetch(() => response(201, serverPost()));
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await h.run(['posts', 'push', file])).toBe(2);
    expect(harness.calls).toHaveLength(0);
  });

  it('rejects an image outside the markdown directory by default', async () => {
    const dir = await makeTempDir();
    const sub = join(dir, 'sub');
    await mkdir(sub, { recursive: true });
    await writeTempFile(dir, 'outside.png', 'PNGDATA');
    const file = await writeTempFile(
      sub,
      'post.md',
      '---\ntitle: X\ncategory: news\n---\n![a](../outside.png)',
    );
    const harness = makeFetch(() => response(201, serverPost()));
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await h.run(['posts', 'push', file])).toBe(2);
    expect(h.stderrText()).toMatch(/allow-outside-dir/);
    expect(harness.calls).toHaveLength(0);
  });

  it('uploads an outside image with --allow-outside-dir', async () => {
    const dir = await makeTempDir();
    const sub = join(dir, 'sub');
    await mkdir(sub, { recursive: true });
    await writeTempFile(dir, 'outside.png', 'PNGDATA');
    const file = await writeTempFile(
      sub,
      'post.md',
      '---\ntitle: X\ncategory: news\n---\n![a](../outside.png)',
    );
    const harness = makeFetch((url) => {
      if (url.includes('/api/v1/media')) {
        return response(201, { url: 'https://cdn.example/o.png', content_type: 'image/png', size: 7 });
      }
      return response(201, serverPost());
    });
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await h.run(['posts', 'push', file, '--allow-outside-dir', '--json'])).toBe(0);
    expect(harness.calls.some((call) => call.url.includes('/api/v1/media'))).toBe(true);
  });

  it('rejects a symlinked image', async () => {
    const dir = await makeTempDir();
    await imageIn(dir, 'real.png');
    await symlink(join(dir, 'real.png'), join(dir, 'link.png'));
    const file = await writeTempFile(
      dir,
      'post.md',
      '---\ntitle: X\ncategory: news\n---\n![a](link.png)',
    );
    const harness = makeFetch(() => response(201, serverPost()));
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await h.run(['posts', 'push', file])).toBe(2);
    expect(h.stderrText()).toMatch(/symbolic link/);
    expect(harness.calls).toHaveLength(0);
  });

  it('rejects an image over 4 MB with exit 6 before any request', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'big.png'), Buffer.alloc(MAX_IMAGE_BYTES + 1));
    const file = await writeTempFile(
      dir,
      'post.md',
      '---\ntitle: X\ncategory: news\n---\n![a](big.png)',
    );
    const harness = makeFetch(() => response(201, serverPost()));
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await h.run(['posts', 'push', file])).toBe(6);
    expect(h.stderrText()).toMatch(/too large/);
    expect(harness.calls).toHaveLength(0);
  });
});

describe('posts get encoding', () => {
  it('encodes the id|slug path segment', async () => {
    const harness = makeFetch(() => response(200, serverPost({ content: '' })));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'get', 'a b/c', '--json'])).toBe(0);
    expect(harness.calls[0]?.url).toBe(
      'https://site.example/api/v1/posts/a%20b%2Fc?format=markdown',
    );
  });
});

describe('posts pull', () => {
  it('writes YAML front matter and the markdown body to stdout', async () => {
    const harness = makeFetch(() =>
      response(200, serverPost({ content: '# Hello\n\nBody', content_format: 'markdown' })),
    );
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'pull', 'hello'])).toBe(0);
    const parsed = parseFrontMatter(h.stdoutText());
    expect(parsed.data).toMatchObject({
      id: POST_ID,
      slug: 'hello',
      category: 'news',
      excerpt: '',
      featured_image: null,
      status: 'draft',
      updated_at: UPDATED,
    });
    expect(parsed.body).toBe('# Hello\n\nBody');
  });

  it('writes to a file with -o', async () => {
    const dir = await makeTempDir();
    const target = join(dir, 'post.md');
    const harness = makeFetch(() => response(200, serverPost({ content: 'Body' })));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'pull', 'hello', '-o', target])).toBe(0);
    const parsed = parseFrontMatter(await readFile(target, 'utf8'));
    expect(parsed.data.id).toBe(POST_ID);
    expect(parsed.body).toBe('Body');
  });
});
