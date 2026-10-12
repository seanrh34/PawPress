import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontMatter } from '../src/frontmatter';
import { makeFetch, makeHarness, makeTempDir, response, writeTempFile } from './helpers';
import type { FetchInit } from '../src/http';

const ENV = { PAWPRESS_URL: 'https://site.example', PAWPRESS_TOKEN: 'pp_test_token' };
const POST_ID = '11111111-1111-1111-1111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const SESSION2 = '33333333-3333-4333-8333-333333333333';
const UPDATED = '2026-10-06T12:00:00.000Z';
const EXPIRES = '2026-10-06T12:15:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2000-01-01T00:00:00.000Z';
const AGENT_LABEL = 'agent "weekly-writer" (alice@example.com)';

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

function lockPayload(session = SESSION) {
  return {
    locking: 'enabled',
    acquired: true,
    lock: {
      session_id: session,
      holder: { kind: 'agent', label: AGENT_LABEL, user_id: 'user-1' },
      acquired_at: UPDATED,
      expires_at: EXPIRES,
    },
  };
}

function lockedError(message: string, takenOver = false) {
  return {
    error: {
      code: 'locked',
      message,
      details: {
        holder: { kind: 'user', label: 'alice@example.com', user_id: 'user-1' },
        acquired_at: UPDATED,
        expires_at: EXPIRES,
        taken_over: takenOver,
      },
    },
  };
}

function bodyOf(init: FetchInit | undefined): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function headerOf(init: FetchInit | undefined, name: string): string | undefined {
  return init?.headers?.[name];
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

describe('posts pull edit locks', () => {
  it('acquires a lock and records it in the front matter', async () => {
    const dir = await makeTempDir();
    const target = join(dir, 'post.md');
    const harness = makeFetch((url, init) => {
      if (url.includes('/lock')) {
        expect(init?.method).toBe('POST');
        return response(200, lockPayload());
      }
      return response(200, serverPost({ content: 'Body' }));
    });
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'pull', 'hello', '-o', target])).toBe(0);
    const parsed = parseFrontMatter(await readFile(target, 'utf8'));
    expect(parsed.data.lock_session).toBe(SESSION);
    expect(parsed.data.lock_expires_at).toBe(EXPIRES);
    expect(harness.methods()).toEqual(['GET', 'POST']);
    // Default TTL of 900 is sent.
    const lockCall = harness.calls.find((call) => call.url.includes('/lock'));
    expect(bodyOf(lockCall?.init)).toEqual({ ttl_seconds: 900 });
  });

  it('honours --lock-ttl and --no-lock', async () => {
    const dir = await makeTempDir();
    const target = join(dir, 'post.md');
    const withTtl = makeFetch((url) =>
      url.includes('/lock') ? response(200, lockPayload()) : response(200, serverPost({ content: 'Body' })),
    );
    const first = makeHarness({ env: ENV, cwd: dir, fetch: withTtl.fetch });
    expect(await first.run(['posts', 'pull', 'hello', '-o', target, '--lock-ttl', '1200'])).toBe(0);
    const lockCall = withTtl.calls.find((call) => call.url.includes('/lock'));
    expect(bodyOf(lockCall?.init)).toEqual({ ttl_seconds: 1200 });

    const noLock = makeFetch(() => response(200, serverPost({ content: 'Body' })));
    const second = makeHarness({ env: ENV, cwd: dir, fetch: noLock.fetch });
    expect(await second.run(['posts', 'pull', 'hello', '-o', target, '--no-lock'])).toBe(0);
    expect(noLock.calls).toHaveLength(1);
    const parsed = parseFrontMatter(await readFile(target, 'utf8'));
    expect(parsed.data.lock_session).toBeUndefined();
  });

  it('exits 5 naming the holder and writes nothing when blocked', async () => {
    const dir = await makeTempDir();
    const target = join(dir, 'post.md');
    const harness = makeFetch((url) =>
      url.includes('/lock')
        ? response(409, lockedError('Admin alice@example.com is editing this post'))
        : response(200, serverPost({ content: 'Body' })),
    );
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'pull', 'hello', '-o', target])).toBe(5);
    expect(h.stderrText()).toMatch(/not editing:/);
    expect(h.stderrText()).toContain('alice@example.com');
    expect(await exists(target)).toBe(false);
  });

  it('emits the JSON error object with the holder when blocked', async () => {
    const harness = makeFetch((url) =>
      url.includes('/lock')
        ? response(409, lockedError('Admin alice@example.com is editing this post'))
        : response(200, serverPost({ content: 'Body' })),
    );
    const h = makeHarness({ env: ENV, fetch: harness.fetch });

    expect(await h.run(['posts', 'pull', 'hello', '--json'])).toBe(5);
    const error = JSON.parse(h.stderrText()).error;
    expect(error.code).toBe('locked');
    expect(error.message).toMatch(/not editing:/);
    expect(error.details.holder.label).toBe('alice@example.com');
  });

  it('notes when locking is unavailable and continues', async () => {
    const dir = await makeTempDir();
    const target = join(dir, 'post.md');
    const harness = makeFetch((url) =>
      url.includes('/lock')
        ? response(200, { locking: 'unavailable', acquired: false, lock: null })
        : response(200, serverPost({ content: 'Body' })),
    );
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'pull', 'hello', '-o', target])).toBe(0);
    expect(h.stderrText()).toMatch(/edit locking unavailable/);
    const parsed = parseFrontMatter(await readFile(target, 'utf8'));
    expect(parsed.data.lock_session).toBeUndefined();
  });
});

describe('posts push edit locks', () => {
  function lockedFile(lockExpiresAt = FUTURE): string {
    return `---\nid: ${POST_ID}\ntitle: X\ncategory: news\nupdated_at: ${UPDATED}\nlock_session: ${SESSION}\nlock_expires_at: ${lockExpiresAt}\n---\nBody`;
  }

  it('sends the lock header and releases the lock on success', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(dir, 'post.md', lockedFile());
    const harness = makeFetch((url, init) => {
      if (init?.method === 'DELETE') return response(200, { released: true });
      return response(200, serverPost());
    });
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'push', file, '--json'])).toBe(0);
    const patch = harness.calls.find((call) => call.init?.method === 'PATCH');
    expect(headerOf(patch?.init, 'X-PawPress-Lock-Session')).toBe(SESSION);
    const release = harness.calls.find((call) => call.init?.method === 'DELETE');
    expect(release?.url).toContain(`/api/v1/posts/${POST_ID}/lock`);
    expect(headerOf(release?.init, 'X-PawPress-Lock-Session')).toBe(SESSION);
  });

  it('keeps the lock with --keep-lock and writes it back', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(dir, 'post.md', lockedFile());
    const harness = makeFetch(() => response(200, serverPost()));
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'push', file, '--keep-lock', '--write-back'])).toBe(0);
    expect(harness.calls.some((call) => call.init?.method === 'DELETE')).toBe(false);
    const parsed = parseFrontMatter(await readFile(file, 'utf8'));
    expect(parsed.data.lock_session).toBe(SESSION);
  });

  it('removes lock fields on --write-back unless kept', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(dir, 'post.md', lockedFile());
    const harness = makeFetch((url, init) =>
      init?.method === 'DELETE' ? response(200, { released: true }) : response(200, serverPost()),
    );
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'push', file, '--write-back'])).toBe(0);
    const parsed = parseFrontMatter(await readFile(file, 'utf8'));
    expect(parsed.data.lock_session).toBeUndefined();
    expect(parsed.data.lock_expires_at).toBeUndefined();
  });

  it('renews an expired lock before pushing', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(dir, 'post.md', lockedFile(PAST));
    const harness = makeFetch((url, init) => {
      if (url.endsWith('/lock') && init?.method === 'POST') {
        return response(200, lockPayload(SESSION2));
      }
      if (init?.method === 'DELETE') return response(200, { released: true });
      return response(200, serverPost());
    });
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'push', file, '--json'])).toBe(0);
    const renew = harness.calls.find((call) => call.url.endsWith('/lock') && call.init?.method === 'POST');
    expect(bodyOf(renew?.init).session_id).toBe(SESSION);
    const patch = harness.calls.find((call) => call.init?.method === 'PATCH');
    expect(headerOf(patch?.init, 'X-PawPress-Lock-Session')).toBe(SESSION2);
  });

  it('reports an admin takeover on 409 and leaves the file untouched', async () => {
    const dir = await makeTempDir();
    const original = lockedFile();
    const file = await writeTempFile(dir, 'post.md', original);
    const harness = makeFetch(() =>
      response(409, lockedError('Your edit session was taken over by admin alice@example.com at 10:02 UTC', true)),
    );
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'push', file])).toBe(5);
    expect(h.stderrText()).toContain('failed to apply edits:');
    expect(h.stderrText()).toContain('taken over by admin alice@example.com at 10:02 UTC');
    expect(h.stderrText()).toContain(`your changes are still in ${file}`);
    expect(await readFile(file, 'utf8')).toBe(original);
  });

  it('reports a generic lock on 409 with the server message', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(dir, 'post.md', lockedFile());
    const harness = makeFetch(() =>
      response(409, lockedError('agent is editing this post')),
    );
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'push', file, '--keep-lock'])).toBe(5);
    expect(h.stderrText()).toContain('failed to apply edits:');
  });

  it('exits 5 when the lock cannot be renewed', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(dir, 'post.md', lockedFile(PAST));
    const harness = makeFetch(() =>
      response(409, lockedError('Admin alice@example.com is editing this post')),
    );
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'push', file])).toBe(5);
    expect(h.stderrText()).toContain('failed to apply edits:');
    expect(harness.calls).toHaveLength(1);
  });
});

describe('posts update/publish/unpublish/delete refusals', () => {
  it('refuses update, publish and delete while someone is editing', async () => {
    const update = makeFetch(() => response(409, lockedError('Admin alice@example.com is editing this post')));
    const updateHarness = makeHarness({ env: ENV, fetch: update.fetch });
    expect(await updateHarness.run(['posts', 'update', POST_ID, '--title', 'X'])).toBe(5);
    expect(updateHarness.stderrText()).toContain('post update refused:');

    const publish = makeFetch(() => response(409, lockedError('Admin alice@example.com is editing this post')));
    const publishHarness = makeHarness({ env: ENV, fetch: publish.fetch });
    expect(await publishHarness.run(['posts', 'publish', POST_ID])).toBe(5);
    expect(publishHarness.stderrText()).toContain('post publish refused:');

    const remove = makeFetch(() => response(409, lockedError('An AI agent is editing this post')));
    const deleteHarness = makeHarness({ env: ENV, fetch: remove.fetch });
    expect(await deleteHarness.run(['posts', 'delete', POST_ID, '--yes'])).toBe(5);
    expect(deleteHarness.stderrText()).toContain('post delete refused:');
  });
});

describe('posts lock and unlock', () => {
  it('acquires by UUID without a lookup and prints the session', async () => {
    const harness = makeFetch(() => response(200, lockPayload()));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });

    expect(await h.run(['posts', 'lock', POST_ID, '--ttl', '300'])).toBe(0);
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0].url).toBe(
      `https://site.example/api/v1/posts/${POST_ID}/lock`,
    );
    expect(bodyOf(harness.calls[0].init)).toEqual({ ttl_seconds: 300 });
    expect(h.stdoutText()).toContain(`session: ${SESSION}`);
    expect(h.stdoutText()).toContain(`expires_at: ${EXPIRES}`);
  });

  it('resolves a slug first and returns the lock in JSON mode', async () => {
    const harness = makeFetch((url, init) => {
      if (init?.method === 'POST' && url.endsWith('/lock')) return response(200, lockPayload());
      return response(200, serverPost());
    });
    const h = makeHarness({ env: ENV, fetch: harness.fetch });

    expect(await h.run(['posts', 'lock', 'hello', '--json'])).toBe(0);
    expect(harness.methods()).toEqual(['GET', 'POST']);
    const lock = JSON.parse(h.stdoutText());
    expect(lock.session_id).toBe(SESSION);
  });

  it('renews with an explicit session', async () => {
    const harness = makeFetch(() => response(200, lockPayload(SESSION2)));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'lock', POST_ID, '--session', SESSION])).toBe(0);
    expect(bodyOf(harness.calls[0].init).session_id).toBe(SESSION);
  });

  it('reports not editing on 409', async () => {
    const harness = makeFetch(() => response(409, lockedError('Admin alice@example.com is editing this post')));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'lock', POST_ID, '--json'])).toBe(5);
    expect(JSON.parse(h.stderrText()).error.code).toBe('locked');
  });

  it('unlocks with the session header', async () => {
    const harness = makeFetch(() => response(200, { released: true }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'unlock', POST_ID, '--session', SESSION, '--json'])).toBe(0);
    expect(harness.calls[0].init?.method).toBe('DELETE');
    expect(headerOf(harness.calls[0].init, 'X-PawPress-Lock-Session')).toBe(SESSION);
  });

  it('requires --session for unlock', async () => {
    const harness = makeFetch(() => response(200, { released: true }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'unlock', POST_ID])).toBe(2);
    expect(harness.calls).toHaveLength(0);
  });
});

describe('posts get edit_lock', () => {
  it('prints the edit_lock line in human mode', async () => {
    const harness = makeFetch(() =>
      response(200, {
        ...serverPost({ content: 'Body' }),
        locking: 'enabled',
        edit_lock: {
          holder: { kind: 'agent', label: AGENT_LABEL, user_id: 'user-1' },
          acquired_at: UPDATED,
          expires_at: EXPIRES,
        },
      }),
    );
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'get', 'hello'])).toBe(0);
    expect(h.stdoutText()).toContain(`edit_lock: agent ${AGENT_LABEL}`);
  });

  it('strips control characters from a server holder label', async () => {
    const harness = makeFetch(() =>
      response(200, {
        ...serverPost({ content: 'Body' }),
        locking: 'enabled',
        edit_lock: {
          holder: { kind: 'agent', label: 'evil\u001b[31m (a@b.c)', user_id: 'user-1' },
          acquired_at: UPDATED,
          expires_at: EXPIRES,
        },
      }),
    );
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'get', 'hello'])).toBe(0);
    expect(h.stdoutText()).not.toContain('\u001b');
    expect(h.stdoutText()).toContain('edit_lock: agent evil[31m (a@b.c)');
  });
});

describe('posts pull without edit rights', () => {
  it('notes a 403 and pulls without a lock', async () => {
    const dir = await makeTempDir();
    const target = join(dir, 'post.md');
    const harness = makeFetch((url) =>
      url.includes('/lock')
        ? response(403, { error: { code: 'forbidden', message: 'Missing required scope: posts:publish' } })
        : response(200, serverPost({ content: 'Body' })),
    );
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });

    expect(await h.run(['posts', 'pull', 'hello', '-o', target])).toBe(0);
    expect(h.stderrText()).toContain("not locking: this token can't edit this post");
    const parsed = parseFrontMatter(await readFile(target, 'utf8'));
    expect(parsed.data.lock_session).toBeUndefined();
  });

  it('still fails a 403 from `posts lock`', async () => {
    const harness = makeFetch(() =>
      response(403, { error: { code: 'forbidden', message: 'Missing required scope: posts:publish' } }),
    );
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'lock', POST_ID])).toBe(3);
  });
});

describe('too_many_locks', () => {
  const message =
    'Too many active edit locks for this user (max 5); release some with `pawpress posts unlock`';

  it('exits 5 with the server message on posts lock', async () => {
    const harness = makeFetch(() =>
      response(409, {
        error: { code: 'conflict', message, details: { reason: 'too_many_locks', limit: 5 } },
      }),
    );
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'lock', POST_ID])).toBe(5);
    expect(h.stderrText()).toContain(message);
  });

  it('exits 5 with the server message on posts pull', async () => {
    const harness = makeFetch((url) =>
      url.includes('/lock')
        ? response(409, {
            error: { code: 'conflict', message, details: { reason: 'too_many_locks', limit: 5 } },
          })
        : response(200, serverPost({ content: 'Body' })),
    );
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'pull', 'hello'])).toBe(5);
    expect(h.stderrText()).toContain(message);
  });
});

describe('sending a lock session on mutations', () => {
  it('posts update sends the --session header', async () => {
    const harness = makeFetch(() => response(200, serverPost()));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(
      await h.run(['posts', 'update', POST_ID, '--title', 'X', '--session', SESSION]),
    ).toBe(0);
    expect(headerOf(harness.calls[0]?.init, 'X-PawPress-Lock-Session')).toBe(SESSION);
  });

  it('posts update --file uses the file front matter lock_session', async () => {
    const dir = await makeTempDir();
    const file = await writeTempFile(
      dir,
      'post.md',
      `---\nid: ${POST_ID}\nlock_session: ${SESSION2}\n---\nBody`,
    );
    const harness = makeFetch(() => response(200, serverPost()));
    const h = makeHarness({ env: ENV, cwd: dir, fetch: harness.fetch });
    expect(await h.run(['posts', 'update', POST_ID, '--file', file])).toBe(0);
    expect(headerOf(harness.calls[0]?.init, 'X-PawPress-Lock-Session')).toBe(SESSION2);
    // The front matter is stripped from the content sent.
    expect(bodyOf(harness.calls[0]?.init).content_markdown).toBe('Body');
  });

  it('posts publish/unpublish/delete send the --session header', async () => {
    const publish = makeFetch(() => response(200, serverPost()));
    const publishHarness = makeHarness({ env: ENV, fetch: publish.fetch });
    expect(await publishHarness.run(['posts', 'publish', POST_ID, '--session', SESSION])).toBe(0);
    expect(headerOf(publish.calls[0]?.init, 'X-PawPress-Lock-Session')).toBe(SESSION);

    const unpublish = makeFetch(() => response(200, serverPost()));
    const unpublishHarness = makeHarness({ env: ENV, fetch: unpublish.fetch });
    expect(await unpublishHarness.run(['posts', 'unpublish', POST_ID, '--session', SESSION])).toBe(0);
    expect(headerOf(unpublish.calls[0]?.init, 'X-PawPress-Lock-Session')).toBe(SESSION);

    const remove = makeFetch(() => response(200, { deleted: true, id: POST_ID }));
    const deleteHarness = makeHarness({ env: ENV, fetch: remove.fetch });
    expect(await deleteHarness.run(['posts', 'delete', POST_ID, '--yes', '--session', SESSION])).toBe(0);
    expect(headerOf(remove.calls[0]?.init, 'X-PawPress-Lock-Session')).toBe(SESSION);
  });

  it('rejects a malformed --session without a request', async () => {
    const harness = makeFetch(() => response(200, serverPost()));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(
      await h.run(['posts', 'publish', POST_ID, '--session', 'not-a-uuid']),
    ).toBe(2);
    expect(harness.calls).toHaveLength(0);
  });
});
