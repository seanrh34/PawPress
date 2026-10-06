import { writeFile } from 'node:fs/promises';
import { optBool, optString, parseOptions } from '../args';
import { CliError, EXIT, usageError } from '../errors';
import { parseFrontMatter, serializeFrontMatter } from '../frontmatter';
import { assertLocalImagesExist, scanLocalImages, uniqueByAbsolutePath } from '../images';
import { makeClient } from '../runtime';
import { truncate } from '../output';
import type { Context } from '../runtime';
import type { ApiClient } from '../http';
import type { ContentFormat, DeletedResponse, Post, PostList } from '../types';
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
const STATUSES = ['draft', 'published', 'all'];

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
    throw usageError(`invalid --status: ${status} (expected draft, published or all)`);
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
      post.status,
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
    { output: { type: 'string', short: 'o' } },
    true,
  );
  const ref = singleRef(positionals, 'posts pull');
  const outputPath = optString(values, 'output');

  const client = await makeClient(ctx);
  const post = await client.request<Post>({
    method: 'GET',
    path: `/api/v1/posts/${encodeURIComponent(ref)}`,
    query: { format: 'markdown' },
  });
  const body = typeof post.content === 'string' ? post.content : '';
  const text = serializeFrontMatter(frontMatterFor(post), body);

  if (outputPath) {
    await writeFile(outputPath, text, 'utf8');
    out.note(`Wrote ${outputPath}`);
    if (out.json) {
      out.jsonDoc({ file: outputPath, id: post.id, updated_at: post.updated_at });
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
      'dry-run': { type: 'boolean' },
      force: { type: 'boolean' },
      'write-back': { type: 'boolean' },
    },
    true,
  );
  const file = singleRef(positionals, 'posts push');
  const publish = optBool(values, 'publish');
  const dryRun = optBool(values, 'dry-run');
  const force = optBool(values, 'force');
  const writeBack = optBool(values, 'write-back');

  const text = await readContentFile(file);
  const doc = parseFrontMatter(text);
  const fields = readFields(doc.data);
  const isUpdate = fields.id !== undefined;

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
  );

  const body: Record<string, unknown> = isUpdate
    ? updateBody(fields, prepared, publish, force)
    : createBody(fields, prepared, publish);
  const path = isUpdate ? `/api/v1/posts/${fields.id}` : '/api/v1/posts';

  if (dryRun) {
    renderPlan(out, [{ method: isUpdate ? 'PATCH' : 'POST', path, body }], prepared.uploads);
    return;
  }

  const client = await makeClient(ctx);
  const post = await sendPost(client, isUpdate ? 'PATCH' : 'POST', path, body, isUpdate, fields.id);

  if (writeBack) {
    const nextData: Record<string, unknown> = { ...doc.data };
    nextData.id = post.id;
    nextData.title = post.title;
    nextData.slug = post.slug;
    nextData.category = post.category ? post.category.slug : null;
    nextData.excerpt = post.excerpt ?? '';
    nextData.featured_image = post.featured_image_url;
    nextData.status = post.status;
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
      'dry-run': { type: 'boolean' },
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
  const dryRun = optBool(values, 'dry-run');

  const content = file ? await readContentFile(file) : await deps.stdin();
  const baseDir = baseDirForFile(file, deps.cwd);
  const prepared = await prepareContent(
    dryRun ? null : await makeClient(ctx),
    content,
    null,
    baseDir,
    dryRun,
  );
  const body: Record<string, unknown> = {
    title,
    slug: optString(values, 'slug'),
    excerpt: optString(values, 'excerpt'),
    category,
    content_markdown: prepared.markdown,
    status: publish ? 'published' : 'draft',
  };
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
      'dry-run': { type: 'boolean' },
    },
    true,
  );
  const id = singleRef(positionals, 'posts update');
  const title = optString(values, 'title');
  const slug = optString(values, 'slug');
  const excerpt = optString(values, 'excerpt');
  const category = optString(values, 'category');
  const featuredImage = optString(values, 'featured-image');
  const ifUpdatedAt = optString(values, 'if-updated-at');
  const file = optString(values, 'file');
  const useStdin = optBool(values, 'stdin');
  const dryRun = optBool(values, 'dry-run');
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
  if (hasContent) {
    const content = file ? await readContentFile(file) : await deps.stdin();
    const baseDir = baseDirForFile(file, deps.cwd);
    prepared = await prepareContent(
      dryRun ? null : await makeClient(ctx),
      content,
      null,
      baseDir,
      dryRun,
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
  const post = await sendPost(client, 'PATCH', path, body, true, id);
  if (out.json) out.jsonDoc(post);
  else printPostSummary(out, post);
}

async function postsSetStatus(
  ctx: Context,
  args: string[],
  action: 'publish' | 'unpublish',
): Promise<void> {
  const { out } = ctx;
  const { positionals } = parseOptions(args, {}, true);
  const id = singleRef(positionals, `posts ${action}`);
  const client = await makeClient(ctx);
  const post = await client.request<Post>({
    method: 'POST',
    path: `/api/v1/posts/${encodeURIComponent(id)}/${action}`,
  });
  if (out.json) out.jsonDoc(post);
  else printPostSummary(out, post);
}

async function postsDelete(ctx: Context, args: string[]): Promise<void> {
  const { out } = ctx;
  const { values, positionals } = parseOptions(
    args,
    { yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' } },
    true,
  );
  const id = singleRef(positionals, 'posts delete');
  const dryRun = optBool(values, 'dry-run');
  if (!optBool(values, 'yes')) {
    throw usageError('posts delete requires --yes');
  }
  const path = `/api/v1/posts/${encodeURIComponent(id)}`;
  if (dryRun) {
    renderPlan(out, [{ method: 'DELETE', path }], []);
    return;
  }
  const client = await makeClient(ctx);
  const result = await client.request<DeletedResponse>({ method: 'DELETE', path });
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
): Promise<Prepared> {
  const refs = scanLocalImages(markdown, featuredImage, baseDir);
  const unique = uniqueByAbsolutePath(refs);
  await assertLocalImagesExist(unique);
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
  status?: 'draft' | 'published';
  updatedAt?: string;
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
    if (status !== 'draft' && status !== 'published') {
      throw usageError('front matter field `status` must be "draft" or "published"');
    }
    fields.status = status;
  }
  return fields;
}

function createBody(
  fields: FrontMatterFields,
  prepared: Prepared,
  publish: boolean,
): Record<string, unknown> {
  const status = publish || fields.status === 'published' ? 'published' : 'draft';
  const body: Record<string, unknown> = {
    title: fields.title,
    slug: fields.slug,
    excerpt: fields.excerpt,
    category: fields.category,
    content_markdown: prepared.markdown,
    status,
  };
  if (fields.hasFeaturedImage) body.featured_image_url = prepared.featuredImage;
  return body;
}

function updateBody(
  fields: FrontMatterFields,
  prepared: Prepared,
  publish: boolean,
  force: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (fields.title !== undefined) body.title = fields.title;
  if (fields.slug !== undefined) body.slug = fields.slug;
  if (fields.excerpt !== undefined) body.excerpt = fields.excerpt;
  if (fields.category !== undefined) body.category = fields.category;
  if (fields.hasFeaturedImage) body.featured_image_url = prepared.featuredImage;
  body.content_markdown = prepared.markdown;
  if (!force && fields.updatedAt) body.if_updated_at = fields.updatedAt;
  if (publish) body.status = 'published';
  else if (fields.status !== undefined) body.status = fields.status;
  return body;
}

async function sendPost(
  client: ApiClient,
  method: 'POST' | 'PATCH',
  path: string,
  body: Record<string, unknown>,
  isUpdate: boolean,
  id: string | undefined,
): Promise<Post> {
  try {
    return await client.request<Post>({ method, path, json: body });
  } catch (error) {
    if (error instanceof CliError && error.exitCode === EXIT.CONFLICT) {
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
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    category: post.category ? post.category.slug : null,
    excerpt: post.excerpt ?? '',
    featured_image: post.featured_image_url ?? null,
    status: post.status,
    updated_at: post.updated_at,
  };
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
