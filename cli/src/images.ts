import { access } from 'node:fs/promises';
import { extname, isAbsolute, resolve } from 'node:path';
import { usageError } from './errors';

export type ImageKind = 'markdown' | 'featured';

export interface ImageRef {
  kind: ImageKind;
  original: string;
  absolutePath: string;
  mime?: string;
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

export function mimeForPath(path: string): string | undefined {
  const ext = extname(path).slice(1).toLowerCase();
  return MIME_BY_EXT[ext];
}

export function isLocalImagePath(path: string): boolean {
  const value = stripAngles(path).trim();
  if (!value) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  if (value.startsWith('/')) return false;
  if (value.startsWith('#')) return false;
  return true;
}

function makeRef(kind: ImageKind, original: string, baseDir: string): ImageRef {
  const path = stripAngles(original).trim();
  const absolutePath = isAbsolute(path) ? path : resolve(baseDir, path);
  return { kind, original: path, absolutePath, mime: mimeForPath(path) };
}

export function scanLocalImages(
  markdown: string,
  featuredImage: string | null | undefined,
  baseDir: string,
): ImageRef[] {
  const refs: ImageRef[] = [];
  mapOutsideFences(markdown, (line) => {
    const regex = imageRegex();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const path = stripAngles(match[2] ?? '');
      if (!isLocalImagePath(path)) continue;
      refs.push(makeRef('markdown', path, baseDir));
    }
    return line;
  });
  if (featuredImage && isLocalImagePath(featuredImage)) {
    refs.push(makeRef('featured', featuredImage, baseDir));
  }
  return refs;
}

export function uniqueByAbsolutePath(refs: ImageRef[]): ImageRef[] {
  const seen = new Set<string>();
  const unique: ImageRef[] = [];
  for (const ref of refs) {
    if (seen.has(ref.absolutePath)) continue;
    seen.add(ref.absolutePath);
    unique.push(ref);
  }
  return unique;
}

export async function assertLocalImagesExist(refs: ImageRef[]): Promise<void> {
  for (const ref of refs) {
    if (!ref.mime) {
      throw usageError(
        `unsupported image type for ${ref.original} (allowed: png, jpg, jpeg, webp, gif, avif)`,
      );
    }
    try {
      await access(ref.absolutePath);
    } catch {
      throw usageError(`local image not found: ${ref.original}`);
    }
  }
}

export function rewriteMarkdownImages(markdown: string, urls: Map<string, string>): string {
  if (urls.size === 0) return markdown;
  return mapOutsideFences(markdown, (line) =>
    line.replace(imageRegex(), (full, alt: string, rawPath: string, title?: string) => {
      const path = stripAngles(rawPath).trim();
      const url = urls.get(path);
      if (!url) return full;
      return `![${alt}](${url}${title ?? ''})`;
    }),
  );
}

export function stripAngles(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return trimmed.slice(1, -1);
  return trimmed;
}

export function mapOutsideFences(markdown: string, fn: (line: string) => string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let inFence = false;
  let marker = '';
  for (const line of lines) {
    const match = /^\s*(```+|~~~+)/.exec(line);
    if (match) {
      const current = match[1][0];
      if (!inFence) {
        inFence = true;
        marker = current;
      } else if (current === marker) {
        inFence = false;
        marker = '';
      }
      out.push(line);
      continue;
    }
    out.push(inFence ? line : fn(line));
  }
  return out.join('\n');
}

function imageRegex(): RegExp {
  return /!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
}
