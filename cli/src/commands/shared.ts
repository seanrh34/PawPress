import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { usageError } from '../errors';
import { rewriteMarkdownImages, stripAngles } from '../images';
import { truncate } from '../output';
import type { Output } from '../output';
import type { ApiClient } from '../http';
import type { ImageRef } from '../images';
import type { Category, Post } from '../types';

export interface PlanRequest {
  method: string;
  path: string;
  body?: unknown;
}

export interface PlanUpload {
  path: string;
  content_type: string;
}

export function renderPlan(out: Output, requests: PlanRequest[], uploads: PlanUpload[]): void {
  const requestsOut = requests.map((request) => ({
    method: request.method,
    path: request.path,
    ...(request.body === undefined ? {} : { body: truncateBody(request.body) }),
  }));
  if (out.json) {
    out.jsonDoc({ dry_run: true, requests: requestsOut, uploads });
    return;
  }
  out.line('Dry run: no request was sent.');
  for (const request of requestsOut) {
    out.line(`${request.method} ${request.path}`);
    if (request.body !== undefined) out.line(JSON.stringify(request.body, null, 2));
  }
  if (uploads.length > 0) {
    out.line('Would upload:');
    for (const upload of uploads) out.line(`  ${upload.path} (${upload.content_type})`);
  }
}

export function truncateBody(body: unknown): unknown {
  if (!isRecord(body)) return body;
  const copy: Record<string, unknown> = { ...body };
  if (typeof copy.content_markdown === 'string') {
    copy.content_markdown = truncate(copy.content_markdown, 200);
  }
  return copy;
}

export function printPostSummary(out: Output, post: Post): void {
  out.line(`id: ${post.id}`);
  out.line(`title: ${post.title}`);
  out.line(`slug: ${post.slug}`);
  out.line(`status: ${post.status}`);
  out.line(`category: ${post.category ? post.category.slug : '(none)'}`);
  out.line(`updated_at: ${post.updated_at}`);
}

export function printCategorySummary(out: Output, category: Category): void {
  out.line(`id: ${category.id}`);
  out.line(`name: ${category.name}`);
  out.line(`slug: ${category.slug}`);
  out.line(`description: ${category.description ?? ''}`);
}

export async function readContentFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    throw usageError(`could not read file: ${path}`);
  }
}

export function baseDirForFile(path: string | undefined, cwd: string): string {
  return path ? dirname(resolve(cwd, path)) : cwd;
}

export function imageMime(ref: ImageRef): string {
  if (!ref.mime) {
    throw usageError(
      `unsupported image type for ${ref.original} (allowed: png, jpg, jpeg, webp, gif, avif)`,
    );
  }
  return ref.mime;
}

export async function uploadLocalImages(
  client: ApiClient,
  unique: ImageRef[],
): Promise<Map<string, string>> {
  const byAbsolute = new Map<string, string>();
  for (const ref of unique) {
    const mime = imageMime(ref);
    const bytes = await readFile(ref.absolutePath);
    const blob = new Blob([new Uint8Array(bytes)], { type: mime });
    const media = (await client.uploadImage(blob, ref.original)) as unknown;
    if (!isRecord(media) || typeof media.url !== 'string') {
      throw usageError(`unexpected media response for ${ref.original}`);
    }
    byAbsolute.set(ref.absolutePath, media.url);
  }
  return byAbsolute;
}

export function applyUploads(
  markdown: string,
  featuredImage: string | null,
  refs: ImageRef[],
  urlByAbsolute: Map<string, string>,
): { markdown: string; featuredImage: string | null } {
  const urlByOriginal = new Map<string, string>();
  for (const ref of refs) {
    const url = urlByAbsolute.get(ref.absolutePath);
    if (url) urlByOriginal.set(ref.original, url);
  }
  const rewritten = rewriteMarkdownImages(markdown, urlByOriginal);
  let nextFeatured = featuredImage;
  if (featuredImage) {
    const stripped = stripAngles(featuredImage);
    const url = urlByOriginal.get(stripped);
    if (url) nextFeatured = url;
  }
  return { markdown: rewritten, featuredImage: nextFeatured };
}

export function planUploads(refs: ImageRef[]): PlanUpload[] {
  return refs.map((ref) => ({ path: ref.original, content_type: ref.mime ?? 'application/octet-stream' }));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
