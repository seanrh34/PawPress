import { writeFile } from 'node:fs/promises';
import { optBool, optString, parseOptions } from '../args';
import type { OptionSpec } from '../args';
import { CliError, EXIT, usageError } from '../errors';
import { assertUuid, isUuid } from '../ids';
import { parseFrontMatter, serializeFrontMatter } from '../frontmatter';
import { assertLocalImagesExist, scanLocalImages, uniqueByAbsolutePath } from '../images';
import { makeClient } from '../runtime';
import { truncate } from '../output';
import type { Context } from '../runtime';
import type { ApiClient } from '../http';
import type { ContentFormat, DeletedResponse, LockResponse, LockReleaseResponse, Post, PostList } from '../types';
import {
  applyUploads,
  baseDirForFile,
  planUploads,
  printPostSummary,
  readContentFile,
  renderPlan,
  uploadLocalImages,
} from './shared';
import type { PlanUpload } from './shared';

const FORMATS: ContentFormat[] = ['markdown', 'lexical', 'html'];
const STATUSES = ['draft', 'scheduled', 'published', 'all'];
const DEFAULT_LOCK_TTL_SECONDS = 900;
const MIN_LOCK_TTL_SECONDS = 60;
const MAX_LOCK_TTL_SECONDS = 3600;
const LOCK_SESSION_HEADER = 'X-PawPress-Lock-Session';

function isLockedError(error: unknown): error is CliError {
  return error instanceof CliError && error.code === 'locked';
}

/**
 * A 403 from the lock endpoint means the token lacks a scope needed to edit the
 * post (e.g. `posts:publish` on a published post). That is not a fatal error
 * for `posts pull`: it falls back to editing without a lock.
 */
function isForbiddenError(error: unknown): boolean {
  return error instanceof CliError && error.status === 403;
}


/**
 * Re-throws a 409 `locked` as `<verb> refused: <message>`, preserving the
 * machine-readable code and the holder details. Other errors pass through.
 */
function reframeLocked(error: unknown, verb: string): never {
  if (isLockedError(error)) {
    throw new CliError(`${verb} refused: ${error.message}`, EXIT.CONFLICT, {
      code: 'locked',
      details: error.details,
    });
  }
  throw error;
}

/** Resolves a slug to a post id (a UUID is used as-is). */
async function resolvePostId(client: ApiClient, ref: string): Promise<string> {
  if (isUuid(ref)) {
    return ref;
  }
  const post = await client.request<Post>({
    method: 'GET',
    path: `/api/v1/posts/${encodeURIComponent(ref)}`,
    query: { format: 'markdown' },
  });
  return post.id;
}

interface LockContext {
  session: string;
  expiresAt: string | null;
}

/**
 * Acquires (or renews with `session`) an agent edit lock. Throws exit-5 for a
 * foreign lock, and returns `null` when locking is unavailable.
 */
async function acquireAgentLock(
  client: ApiClient,
  id: string,
  options: { session?: string; ttlSeconds: number; verb: string },
): Promise<LockContext | null> {
  let response: LockResponse;
  try {
    response = await client.request<LockResponse>({
      method: 'POST',
      path: `/api/v1/posts/${encodeURIComponent(id)}/lock`,
      json: {
        ttl_seconds: options.ttlSeconds,
        ...(options.session === undefined ? {} : { session_id: options.session }),
      },
    });
  } catch (error) {
    if (isLockedError(error)) {
      throw new CliError(`not editing: ${error.message}`, EXIT.CONFLICT, {
        code: 'locked',
        details: error.details,
      });
    }
    throw error;
  }

  if (response.locking !== 'enabled' || !response.lock?.session_id) {
    // Missing mode (older server) or unavailable migration: no lock to hold.
    return null;
  }
  return { session: response.lock.session_id, expiresAt: response.lock.expires_at };
}

/** Best-effort release of our own lock; failures are ignored. */
async function releaseAgentLock(
  client: ApiClient,
  id: string,
  session: string,
): Promise<void> {
  try {
    await client.request<LockReleaseResponse>({
      method: 'DELETE',
      path: `/api/v1/posts/${encodeURIComponent(id)}/lock`,
      headers: { [LOCK_SESSION_HEADER]: session },
    });
  } catch {
    // Releasing is best-effort; the lease expires on its own.
  }
}

const ISO_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;

/**
 * Validates a `--at` / front matter `publish_at` locally: an ISO-8601
 * timestamp with an explicit offset or `Z`, in the future. Bad values are
 * usage errors (exit 2) so nothing is sent to the server.
 */
function assertFutureIso(value: string, label: string): string {
  const format =
    `${label} must be an ISO-8601 timestamp with an explicit offset or Z ` +
    `(e.g. 2026-10-20T09:00:00+08:00)`;
  if (!ISO_OFFSET_PATTERN.test(value)) {
    throw usageError(format);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw usageError(format);
  }
  if (parsed <= Date.now()) {
    throw usageError(`${label} must be in the future`);
  }
  return value;
}

export async function postsCommand(ctx: Context, args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'list':
      return postsList(ctx, rest);
    case 'get':
      return postsGet(ctx, rest);
    case 'pull':
      return postsPull(ctx, rest);
    case 'push':
      return postsPush(ctx, rest);
    case 'create':
      return postsCreate(ctx, rest);
    case 'update':
      return postsUpdate(ctx, rest);
    case 'publish':
      return postsSetStatus(ctx, rest, 'publish');
    case 'unpublish':
      return postsSetStatus(ctx, rest, 'unpublish');
    case 'delete':
      return postsDelete(ctx, rest);
    case 'lock':
      return postsLock(ctx, rest);
    case 'unlock':
      return postsUnlock(ctx, rest);
    case undefined:
      throw usageError('posts requires a subcommand');
    default:
      throw usageError(`unknown posts subcommand: ${sub}`);
  }
}

async function postsList(ctx: Context, args: string[]): Promise<void> {
  const { out } = ctx;
  const { values } = parseOptions(
    args,
    {
      status: { type: 'string' },
      category: { type: 'string' },
      search: { type: 'string' },
      limit: { type: 'string' },
      offset: { type: 'string' },
    },
    false,
  );
  const status = optString(values, 'status');
  if (status && !STATUSES.includes(status)) {
    throw usageError(`invalid --status: ${status} (expected draft, scheduled, published or all)`);
  }
  const limit = intOption(values, 'limit', { min: 1, max: 100 });
  const offset = intOption(values, 'offset', { min: 0 });

  const client = await makeClient(ctx);
  const result = await client.request<PostList>({
    method: 'GET',
    path: '/api/v1/posts',
    query: {
      status,
      category: optString(values, 'category'),
      q: optString(values, 'search'),
      limit,
      offset,
    },
  });

  if (out.json) {
    out.jsonDoc(result);
    return;
  }
  out.table(
    ['id', 'status', 'updated_at', 'slug', 'title'],
    result.items.map((post) => [
      post.id,
      post.status === 'scheduled' && post.published_at
        ? `scheduled ${post.published_at}`
        : post.status,
      post.updated_at,
      post.slug,
      truncate(post.title, 50),
    ]),
  );
}

async function postsGet(ctx: Context, args: string[]): Promise<void> {
  const { out } = ctx;
  const { values, positionals } = parseOptions(
    args,
    { format: { type: 'string' }, output: { type: 'string', short: 'o' } },
    true,
  );
  const ref = singleRef(positionals, 'posts get');
  const format = contentFormat(optString(values, 'format'));
  const outputPath = optString(values, 'output');

  const client = await makeClient(ctx);
  const post = await client.request<Post>({
    method: 'GET',
    path: `/api/v1/posts/${encodeURIComponent(ref)}`,
    query: { format },
  });

  if (outputPath) {
    await writeFile(outputPath, contentToText(post.content, format), 'utf8');
    out.note(`Wrote ${outputPath}`);
    if (out.json) out.jsonDoc(post);
    else printPostSummary(out, post);
    return;
  }
  if (out.json) {
    out.jsonDoc(post);
    return;
  }
  printPostSummary(out, post);
  const text = contentToText(post.content, format).replace(/\n$/, '');
  if (text) {
    out.line('');
    out.line(text);
  }
}

async function postsPull(ctx: Context, args: string[]): Promise<void> {
  const { out } = ctx;
  const { values, positionals } = parseOptions(
    args,
    {
      output: { type: 'string', short: 'o' },
      'lock-ttl': { type: 'string' },
      'no-lock': { type: 'boolean' },
    },
    true,
  );
  const ref = singleRef(positionals, 'posts pull');
  const outputPath = optString(values, 'output');
  const noLock = optBool(values, 'no-lock');

  const client = await makeClient(ctx);
  const post = await client.request<Post>({
    method: 'GET',
    path: `/api/v1/posts/${encodeURIComponent(ref)}`,
    query: { format: 'markdown' },
  });
  const body = typeof post.content === 'string' ? post.content : '';

  // Acquiring a lock is the default; --no-lock opts out.
  let lock: LockContext | null = null;
  if (!noLock) {
    const ttl = intOption(values, 'lock-ttl', {
      min: MIN_LOCK_TTL_SECONDS,
      max: MAX_LOCK_TTL_SECONDS,
    });
    let forbidden = false;
    try {
      lock = await acquireAgentLock(client, post.id, {
        ttlSeconds: ttl ?? DEFAULT_LOCK_TTL_SECONDS,
        verb: 'pull',
      });
    } catch (error) {
      if (isForbiddenError(error)) {
        // A read-only token can still pull (for review); it just can't lock.
        out.note("not locking: this token can't edit this post");
        forbidden = true;
      } else {
        throw error;
      }
    }
    if (!lock && !forbidden) {
      out.note(
        'edit locking unavailable on this site; relying on updated_at conflict detection',
      );
    }
  }

  const data = frontMatterFor(post);
  if (lock) {
    data.lock_session = lock.session;
    if (lock.expiresAt) data.lock_expires_at = lock.expiresAt;
  }
  const text = serializeFrontMatter(data, body);

  if (outputPath) {
    await writeFile(outputPath, text, 'utf8');
    out.note(`Wrote ${outputPath}`);
    if (out.json) {
      out.jsonDoc({
        file: outputPath,
        id: post.id,
        updated_at: post.updated_at,
        lock_session: lock?.session ?? null,
        lock_expires_at: lock?.expiresAt ?? null,
      });
    }
    return;
  }
  out.raw(text);
}

async function postsPush(ctx: Context, args: string[]): Promise<void> {
  const { deps, out } = ctx;
  const { values, positionals } = parseOptions(
    args,
    {
      publish: { type: 'boolean' },
      at: { type: 'string' },
      'dry-run': { type: 'boolean' },
      force: { type: 'boolean' },
      'write-back': { type: 'boolean' },
      'keep-lock': { type: 'boolean' },
      'allow-outside-dir': { type: 'boolean' },
    },
    true,
  );
  const file = singleRef(positionals, 'posts push');
  const publish = optBool(values, 'publish');
  const at = optString(values, 'at');
  if (publish && at !== undefined) {
    throw usageError('--at cannot be combined with --publish (choose one)');
  }
  if (at !== undefined) assertFutureIso(at, '--at');
  const dryRun = optBool(values, 'dry-run');
  const force = optBool(values, 'force');
  const writeBack = optBool(values, 'write-back');
  const keepLock = optBool(values, 'keep-lock');
  const allowOutsideDir = optBool(values, 'allow-outside-dir');

  const text = await readContentFile(file);
  const doc = parseFrontMatter(text);
  const fields = readFields(doc.data);
  const updateId = fields.id !== undefined ? assertUuid(fields.id, 'post id') : undefined;
  const isUpdate = updateId !== undefined;

  if (isUpdate && !fields.updatedAt && !force) {
    throw usageError(
      'front matter is missing updated_at; run `pawpress posts pull` first or pass --force',
    );
  }
  if (!isUpdate && !fields.title) {
    throw usageError('front matter is missing title (required to create a post)');
  }
  if (!isUpdate && !fields.category) {
    throw usageError('front matter is missing category (required to create a post)');
  }

  const baseDir = baseDirForFile(file, deps.cwd);
  const prepared = await prepareContent(
    dryRun ? null : await makeClient(ctx),
    doc.body,
    fields.featuredImage,
    baseDir,
    dryRun,
    allowOutsideDir,
  );

  const body: Record<string, unknown> = isUpdate
    ? updateBody(fields, prepared, publish, force, at)
    : createBody(fields, prepared, publish, at);
  const path = isUpdate && updateId ? `/api/v1/posts/${encodeURIComponent(updateId)}` : '/api/v1/posts';

  if (dryRun) {
    renderPlan(out, [{ method: isUpdate ? 'PATCH' : 'POST', path, body }], prepared.uploads);
    return;
  }

  const client = await makeClient(ctx);

  // If the front matter carries a lock session, renew it when the lease has
  // expired, then send the session header so the server knows this is "us".
  let lockSession = isUpdate ? fields.lockSession : undefined;
  let lockExpiresAt = fields.lockExpiresAt ?? null;
  if (isUpdate && updateId && lockSession) {
    const expiresMs = lockExpiresAt ? Date.parse(lockExpiresAt) : NaN;
    const expired = !Number.isFinite(expiresMs) || expiresMs <= Date.now();
    if (expired) {
      try {
        const renewed = await acquireAgentLock(client, updateId, {
          session: lockSession,
          ttlSeconds: DEFAULT_LOCK_TTL_SECONDS,
          verb: 'push',
        });
        if (renewed) {
          lockSession = renewed.session;
          lockExpiresAt = renewed.expiresAt;
        } else {
          out.note(
            'edit locking unavailable on this site; relying on updated_at conflict detection',
          );
          lockSession = undefined;
        }
      } catch (error) {
        if (isLockedError(error)) {
          throw new CliError(`failed to apply edits: ${error.message}`, EXIT.CONFLICT, {
            code: 'locked',
            details: error.details,
          });
        }
        throw error;
      }
    }
  }

  let post: Post;
  try {
    post = await sendPost(
      client,
      isUpdate ? 'PATCH' : 'POST',
      path,
      body,
      isUpdate,
      updateId,
      lockSession,
    );
  } catch (error) {
    if (isLockedError(error)) {
      // The server message names the holder and, for a takeover, says so
      // ("Your edit session was taken over by admin alice@… at 10:05 UTC").
      const reason = error.message;
      throw new CliError(
        `failed to apply edits: ${reason}; your changes are still in ${file}`,
        EXIT.CONFLICT,
        { code: 'locked', details: error.details },
      );
    }
    throw error;
  }

  // A successful update releases our lock unless the caller wants to keep it.
  if (isUpdate && updateId && lockSession && !keepLock) {
    await releaseAgentLock(client, updateId, lockSession);
    lockSession = undefined;
  }

  if (writeBack) {
    const nextData: Record<string, unknown> = { ...doc.data };
    nextData.id = post.id;
    nextData.title = post.title;
    nextData.slug = post.slug;
    nextData.category = post.category ? post.category.slug : null;
    nextData.excerpt = post.excerpt ?? '';
    nextData.featured_image = post.featured_image_url;
    nextData.status = post.status;
    if (post.status === 'scheduled' && post.published_at) {
      nextData.publish_at = post.published_at;
    } else {
      delete nextData.publish_at;
    }
    if (keepLock && lockSession) {
      nextData.lock_session = lockSession;
      if (lockExpiresAt) nextData.lock_expires_at = lockExpiresAt;
    } else {
      delete nextData.lock_session;
      delete nextData.lock_expires_at;
    }
    nextData.updated_at = post.updated_at;
    await writeFile(file, serializeFrontMatter(nextData, prepared.markdown), 'utf8');
    out.note(`Wrote ${file}`);
  } else {
    out.note(
      'the local updated_at is now stale; run `pawpress posts pull` to refresh or push with --write-back',
    );
  }

  if (out.json) out.jsonDoc(post);
  else printPostSummary(out, post);
}

async function postsCreate(ctx: Context, args: string[]): Promise<void> {
  const { deps, out } = ctx;
  const { values } = parseOptions(
    args,
    {
      title: { type: 'string' },
      category: { type: 'string' },
      slug: { type: 'string' },
      excerpt: { type: 'string' },
      file: { type: 'string' },
      stdin: { type: 'boolean' },
      publish: { type: 'boolean' },
      at: { type: 'string' },
      'dry-run': { type: 'boolean' },
      'allow-outside-dir': { type: 'boolean' },
    },
    false,
  );
  const title = optString(values, 'title');
  const category = optString(values, 'category');
  if (!title) throw usageError('posts create requires --title');
  if (!category) throw usageError('posts create requires --category');
  const file = optString(values, 'file');
  const useStdin = optBool(values, 'stdin');
  if (Boolean(file) === useStdin) {
    throw usageError('posts create requires exactly one of --file or --stdin');
  }
  const publish = optBool(values, 'publish');
  const at = optString(values, 'at');
  if (publish && at !== undefined) {
    throw usageError('--at cannot be combined with --publish (choose one)');
  }
  if (at !== undefined) assertFutureIso(at, '--at');
  const dryRun = optBool(values, 'dry-run');
  const allowOutsideDir = optBool(values, 'allow-outside-dir');

  const content = file ? await readContentFile(file) : await deps.stdin();
  const baseDir = baseDirForFile(file, deps.cwd);
  const prepared = await prepareContent(
    dryRun ? null : await makeClient(ctx),
    content,
    null,
    baseDir,
    dryRun,
    allowOutsideDir,
  );
  const body: Record<string, unknown> = {
    title,
    slug: optString(values, 'slug'),
    excerpt: optString(values, 'excerpt'),
    category,
    content_markdown: prepared.markdown,
    status: publish ? 'published' : at !== undefined ? 'scheduled' : 'draft',
  };
  if (at !== undefined) body.publish_at = at;
  const path = '/api/v1/posts';

  if (dryRun) {
    renderPlan(out, [{ method: 'POST', path, body }], prepared.uploads);
    return;
  }

  const client = await makeClient(ctx);
  const post = await sendPost(client, 'POST', path, body, false, undefined);
  if (out.json) out.jsonDoc(post);
  else printPostSummary(out, post);
}

async function postsUpdate(ctx: Context, args: string[]): Promise<void> {
  const { deps, out } = ctx;
  const { values, positionals } = parseOptions(
    args,
    {
      title: { type: 'string' },
      slug: { type: 'string' },
      excerpt: { type: 'string' },
      category: { type: 'string' },
      'featured-image': { type: 'string' },
      file: { type: 'string' },
      stdin: { type: 'boolean' },
      'if-updated-at': { type: 'string' },
      session: { type: 'string' },
      'dry-run': { type: 'boolean' },
      'allow-outside-dir': { type: 'boolean' },
    },
    true,
  );
  const id = assertUuid(singleRef(positionals, 'posts update'), 'post id');
  const title = optString(values, 'title');
  const slug = optString(values, 'slug');
  const excerpt = optString(values, 'excerpt');
  const category = optString(values, 'category');
  const featuredImage = optString(values, 'featured-image');
  const ifUpdatedAt = optString(values, 'if-updated-at');
  const file = optString(values, 'file');
  const useStdin = optBool(values, 'stdin');
  const sessionOption = optString(values, 'session');
  if (sessionOption !== undefined) assertUuid(sessionOption, 'lock session');
  const dryRun = optBool(values, 'dry-run');
  const allowOutsideDir = optBool(values, 'allow-outside-dir');
  if (file && useStdin) throw usageError('posts update accepts at most one of --file or --stdin');
  const hasContent = Boolean(file) || useStdin;

  if (
    title === undefined &&
    slug === undefined &&
    excerpt === undefined &&
    category === undefined &&
    featuredImage === undefined &&
    !hasContent
  ) {
    throw usageError('posts update requires at least one field to change');
  }

  const body: Record<string, unknown> = {};
  if (title !== undefined) body.title = title;
  if (slug !== undefined) body.slug = slug;
  if (excerpt !== undefined) body.excerpt = excerpt;
  if (category !== undefined) body.category = category;
  if (featuredImage !== undefined) body.featured_image_url = featuredImage;

  let prepared: Prepared | undefined;
  // A `--file` produced by `posts pull` may carry a lock_session; honour it so
  // an agent isn't blocked by its own lock (unless --session overrides it).
  let lockSession = sessionOption;
  if (hasContent) {
    const raw = file ? await readContentFile(file) : await deps.stdin();
    let content = raw;
    if (file) {
      const doc = parseFrontMatter(raw);
      if (lockSession === undefined) {
        const fromFile = doc.data.lock_session;
        if (typeof fromFile === 'string' && fromFile !== '') {
          assertUuid(fromFile, 'lock_session in front matter');
          lockSession = fromFile;
        }
      }
      content = doc.body;
    }
    const baseDir = baseDirForFile(file, deps.cwd);
    prepared = await prepareContent(
      dryRun ? null : await makeClient(ctx),
      content,
      null,
      baseDir,
      dryRun,
      allowOutsideDir,
    );
    body.content_markdown = prepared.markdown;
  }
  if (ifUpdatedAt !== undefined) body.if_updated_at = ifUpdatedAt;

  const path = `/api/v1/posts/${encodeURIComponent(id)}`;
  if (dryRun) {
    renderPlan(out, [{ method: 'PATCH', path, body }], prepared?.uploads ?? []);
    return;
  }

  const client = await makeClient(ctx);
  let post: Post;
  try {
    post = await sendPost(client, 'PATCH', path, body, true, id, lockSession);
  } catch (error) {
    reframeLocked(error, 'post update');
  }
  if (out.json) out.jsonDoc(post);
  else printPostSummary(out, post);
}

async function postsLock(ctx: Context, args: string[]): Promise<void> {
  const { out } = ctx;
  const { values, positionals } = parseOptions(
    args,
    { ttl: { type: 'string' }, session: { type: 'string' } },
    true,
  );
  const ref = singleRef(positionals, 'posts lock');
  const ttl = intOption(values, 'ttl', {
    min: MIN_LOCK_TTL_SECONDS,
    max: MAX_LOCK_TTL_SECONDS,
  });
  const session = optString(values, 'session');
  if (session !== undefined) assertUuid(session, 'lock session');

  const client = await makeClient(ctx);
  const id = await resolvePostId(client, ref);

  let response: LockResponse;
  try {
    response = await client.request<LockResponse>({
      method: 'POST',
      path: `/api/v1/posts/${encodeURIComponent(id)}/lock`,
      json: {
        ttl_seconds: ttl ?? DEFAULT_LOCK_TTL_SECONDS,
        ...(session === undefined ? {} : { session_id: session }),
      },
    });
  } catch (error) {
    if (isLockedError(error)) {
      throw new CliError(`not editing: ${error.message}`, EXIT.CONFLICT, {
        code: 'locked',
        details: error.details,
      });
    }
    throw error;
  }

  if (response.locking === 'unavailable') {
    out.note(
      'edit locking unavailable on this site; relying on updated_at conflict detection',
    );
    return;
  }

  if (out.json) {
    out.jsonDoc(response.lock);
    return;
  }
  out.line(`post: ${id}`);
  out.line(`session: ${response.lock?.session_id ?? ''}`);
  out.line(`expires_at: ${response.lock?.expires_at ?? ''}`);
}

async function postsUnlock(ctx: Context, args: string[]): Promise<void> {
  const { out } = ctx;
  const { values, positionals } = parseOptions(
    args,
    { session: { type: 'string' } },
    true,
  );
  const id = assertUuid(singleRef(positionals, 'posts unlock'), 'post id');
  const session = optString(values, 'session');
  if (session === undefined) {
    throw usageError('posts unlock requires --session <uuid>');
  }
  assertUuid(session, 'lock session');

  const client = await makeClient(ctx);
  const result = await client.request<LockReleaseResponse>({
    method: 'DELETE',
    path: `/api/v1/posts/${encodeURIComponent(id)}/lock`,
    headers: { [LOCK_SESSION_HEADER]: session },
  });
  if (out.json) {
    out.jsonDoc(result);
    return;
  }
  out.line(
    result.released
      ? `Released lock for post ${id}`
      : `No lock to release for post ${id}`,
  );
}

async function postsSetStatus(
  ctx: Context,
  args: string[],
  action: 'publish' | 'unpublish',
): Promise<void> {
  const { out } = ctx;
  const options: OptionSpec =
    action === 'publish'
      ? { at: { type: 'string' }, session: { type: 'string' } }
      : { session: { type: 'string' } };
  const { values, positionals } = parseOptions(args, options, true);
  const id = assertUuid(singleRef(positionals, `posts ${action}`), 'post id');
  const at = action === 'publish' ? optString(values, 'at') : undefined;
  if (at !== undefined) assertFutureIso(at, '--at');
  const session = optString(values, 'session');
  if (session !== undefined) assertUuid(session, 'lock session');

  const client = await makeClient(ctx);
  let post: Post;
  try {
    post = await client.request<Post>({
      method: 'POST',
      path: `/api/v1/posts/${encodeURIComponent(id)}/${action}`,
      ...(at === undefined ? {} : { json: { at } }),
      ...(session === undefined
        ? {}
        : { headers: { [LOCK_SESSION_HEADER]: session } }),
    });
  } catch (error) {
    reframeLocked(error, `post ${action}`);
  }
  if (out.json) out.jsonDoc(post);
  else printPostSummary(out, post);
}

async function postsDelete(ctx: Context, args: string[]): Promise<void> {
  const { out } = ctx;
  const { values, positionals } = parseOptions(
    args,
    { yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, session: { type: 'string' } },
    true,
  );
  const id = assertUuid(singleRef(positionals, 'posts delete'), 'post id');
  const dryRun = optBool(values, 'dry-run');
  const session = optString(values, 'session');
  if (session !== undefined) assertUuid(session, 'lock session');
  if (!optBool(values, 'yes')) {
    throw usageError('posts delete requires --yes');
  }
  const path = `/api/v1/posts/${encodeURIComponent(id)}`;
  if (dryRun) {
    renderPlan(out, [{ method: 'DELETE', path }], []);
    return;
  }
  const client = await makeClient(ctx);
  let result: DeletedResponse;
  try {
    result = await client.request<DeletedResponse>({
      method: 'DELETE',
      path,
      ...(session === undefined
        ? {}
        : { headers: { [LOCK_SESSION_HEADER]: session } }),
    });
  } catch (error) {
    reframeLocked(error, 'post delete');
  }
  if (out.json) out.jsonDoc(result);
  else out.line(`Deleted post ${result.id}`);
}

interface Prepared {
  markdown: string;
  featuredImage: string | null;
  uploads: PlanUpload[];
}

async function prepareContent(
  client: ApiClient | null,
  markdown: string,
  featuredImage: string | null,
  baseDir: string,
  dryRun: boolean,
  allowOutsideDir: boolean,
): Promise<Prepared> {
  const refs = scanLocalImages(markdown, featuredImage, baseDir);
  const unique = uniqueByAbsolutePath(refs);
  await assertLocalImagesExist(unique, { allowOutsideDir });
  if (dryRun) {
    return { markdown, featuredImage, uploads: planUploads(unique) };
  }
  if (unique.length === 0) {
    return { markdown, featuredImage, uploads: [] };
  }
  if (!client) throw usageError('internal error: missing client for upload');
  const urlByAbsolute = await uploadLocalImages(client, unique);
  const applied = applyUploads(markdown, featuredImage, refs, urlByAbsolute);
  return { markdown: applied.markdown, featuredImage: applied.featuredImage, uploads: [] };
}

interface FrontMatterFields {
  id?: string;
  title?: string;
  slug?: string;
  excerpt?: string;
  category?: string;
  featuredImage: string | null;
  hasFeaturedImage: boolean;
  status?: 'draft' | 'scheduled' | 'published';
  publishAt?: string;
  updatedAt?: string;
  lockSession?: string;
  lockExpiresAt?: string;
}

function readFields(data: Record<string, unknown>): FrontMatterFields {
  const fields: FrontMatterFields = {
    featuredImage: null,
    hasFeaturedImage: Object.prototype.hasOwnProperty.call(data, 'featured_image'),
    id: optionalString(data, 'id'),
    title: optionalString(data, 'title'),
    slug: optionalString(data, 'slug'),
    excerpt: optionalString(data, 'excerpt'),
    category: optionalString(data, 'category'),
    updatedAt: optionalString(data, 'updated_at'),
    lockSession: optionalString(data, 'lock_session'),
    lockExpiresAt: optionalString(data, 'lock_expires_at'),
  };
  const featured = data.featured_image;
  if (featured !== undefined && featured !== null) {
    if (typeof featured !== 'string') {
      throw usageError('front matter field `featured_image` must be a string or null');
    }
    fields.featuredImage = featured;
  }
  const status = optionalString(data, 'status');
  if (status !== undefined) {
    if (status !== 'draft' && status !== 'published' && status !== 'scheduled') {
      throw usageError('front matter field `status` must be "draft", "scheduled" or "published"');
    }
    fields.status = status;
  }
  const publishAt = optionalString(data, 'publish_at');
  if (publishAt !== undefined) {
    if (fields.status !== 'scheduled') {
      throw usageError('front matter field `publish_at` requires `status: scheduled`');
    }
    assertFutureIso(publishAt, 'publish_at');
    fields.publishAt = publishAt;
  }
  return fields;
}

function createBody(
  fields: FrontMatterFields,
  prepared: Prepared,
  publish: boolean,
  at: string | undefined,
): Record<string, unknown> {
  const status: 'draft' | 'scheduled' | 'published' = publish
    ? 'published'
    : at !== undefined
      ? 'scheduled'
      : (fields.status ?? 'draft');
  const body: Record<string, unknown> = {
    title: fields.title,
    slug: fields.slug,
    excerpt: fields.excerpt,
    category: fields.category,
    content_markdown: prepared.markdown,
    status,
  };
  if (status === 'scheduled') {
    body.publish_at = requirePublishAt(fields, at);
  }
  if (fields.hasFeaturedImage) body.featured_image_url = prepared.featuredImage;
  return body;
}

function updateBody(
  fields: FrontMatterFields,
  prepared: Prepared,
  publish: boolean,
  force: boolean,
  at: string | undefined,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (fields.title !== undefined) body.title = fields.title;
  if (fields.slug !== undefined) body.slug = fields.slug;
  if (fields.excerpt !== undefined) body.excerpt = fields.excerpt;
  if (fields.category !== undefined) body.category = fields.category;
  if (fields.hasFeaturedImage) body.featured_image_url = prepared.featuredImage;
  body.content_markdown = prepared.markdown;
  if (!force && fields.updatedAt) body.if_updated_at = fields.updatedAt;

  const status = publish ? 'published' : at !== undefined ? 'scheduled' : fields.status;
  if (status === 'published') {
    body.status = 'published';
  } else if (status === 'scheduled') {
    body.status = 'scheduled';
    body.publish_at = requirePublishAt(fields, at);
  } else if (status === 'draft') {
    body.status = 'draft';
  }
  return body;
}

function requirePublishAt(
  fields: FrontMatterFields,
  at: string | undefined,
): string {
  const publishAt = at ?? fields.publishAt;
  if (!publishAt) {
    throw usageError(
      'front matter field `publish_at` is required when `status: scheduled`',
    );
  }
  return publishAt;
}

async function sendPost(
  client: ApiClient,
  method: 'POST' | 'PATCH',
  path: string,
  body: Record<string, unknown>,
  isUpdate: boolean,
  id: string | undefined,
  lockSession?: string,
): Promise<Post> {
  try {
    return await client.request<Post>({
      method,
      path,
      json: body,
      ...(lockSession === undefined
        ? {}
        : { headers: { [LOCK_SESSION_HEADER]: lockSession } }),
    });
  } catch (error) {
    // A foreign/lost edit lock is reported verbatim so the caller can name who
    // is editing; only genuine `conflict` (stale updated_at) gets the hint.
    if (error instanceof CliError && error.code === 'conflict') {
      const hint = isUpdate
        ? `the post changed on the server; run \`pawpress posts pull ${id ?? ''}\` and merge, or retry with --force`
        : 'that slug is already taken; choose a different --slug';
      throw new CliError(`${error.message}; ${hint}`, EXIT.CONFLICT, {
        code: error.code ?? 'conflict',
        details: error.details,
      });
    }
    throw error;
  }
}

function frontMatterFor(post: Post): Record<string, unknown> {
  const data: Record<string, unknown> = {
    id: post.id,
    title: post.title,
    slug: post.slug,
    category: post.category ? post.category.slug : null,
    excerpt: post.excerpt ?? '',
    featured_image: post.featured_image_url ?? null,
    status: post.status,
    updated_at: post.updated_at,
  };
  if (post.status === 'scheduled' && post.published_at) {
    data.publish_at = post.published_at;
  }
  return data;
}

function contentToText(content: unknown, format: ContentFormat): string {
  if (format === 'lexical') return `${JSON.stringify(content ?? null, null, 2)}\n`;
  return typeof content === 'string' ? content : '';
}

function contentFormat(value: string | undefined): ContentFormat {
  if (value === undefined) return 'markdown';
  if (!FORMATS.includes(value as ContentFormat)) {
    throw usageError(`invalid --format: ${value} (expected markdown, lexical or html)`);
  }
  return value as ContentFormat;
}

function optionalString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw usageError(`front matter field \`${key}\` must be a string`);
  }
  return value;
}

function intOption(
  values: Record<string, unknown>,
  key: string,
  bounds: { min: number; max?: number },
): number | undefined {
  const raw = optString(values, key);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < bounds.min || (bounds.max !== undefined && value > bounds.max)) {
    const range = bounds.max !== undefined ? `${bounds.min}-${bounds.max}` : `>= ${bounds.min}`;
    throw usageError(`--${key} must be an integer (${range})`);
  }
  return value;
}

function singleRef(positionals: string[], command: string): string {
  const [ref, ...extra] = positionals;
  if (!ref) throw usageError(`${command} requires an argument`);
  if (extra.length > 0) throw usageError(`${command} accepts a single argument`);
  return ref;
}
