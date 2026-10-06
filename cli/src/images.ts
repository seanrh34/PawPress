import { lstat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { CliError, EXIT, usageError } from './errors';

export type ImageKind = 'markdown' | 'featured';

export interface ImageRef {
  kind: ImageKind;
  original: string;
  absolutePath: string;
  baseDir: string;
  mime?: string;
}

/** Server-enforced media limit; checked locally before reading the file. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

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
  return { kind, original: path, absolutePath, baseDir, mime: mimeForPath(path) };
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

/**
 * Builds an {@link ImageRef} for a path given directly on the command line
 * (e.g. `pawpress media upload`). The base directory is the file's own
 * directory, so containment checks are only meaningful for markdown uploads.
 */
export function imageRefForPath(path: string): ImageRef {
  const absolutePath = resolve(path);
  return {
    kind: 'markdown',
    original: path,
    absolutePath,
    baseDir: dirname(absolutePath),
    mime: mimeForPath(path),
  };
}

export async function assertLocalImagesExist(
  refs: ImageRef[],
  options: { allowOutsideDir?: boolean } = {},
): Promise<void> {
  for (const ref of refs) {
    if (!options.allowOutsideDir && escapesContentDir(ref)) {
      throw usageError(
        `image path is outside the content directory: ${ref.original} (pass --allow-outside-dir to allow this)`,
      );
    }
    await assertLocalImageFile(ref);
  }
}

/**
 * True when a resolved image path is not underneath the markdown file's
 * directory. `path.relative` returns a `..`-prefixed or absolute value for
 * anything outside the base.
 */
function escapesContentDir(ref: ImageRef): boolean {
  const rel = relative(ref.baseDir, ref.absolutePath);
  if (rel === '') {
    return false;
  }
  return rel.startsWith('..') || isAbsolute(rel);
}

/**
 * Checks a single local image without reading it: the MIME type must be
 * supported, the path must be a regular file (not a symlink), and it must not
 * exceed the server's 4 MB media limit.
 */
export async function assertLocalImageFile(ref: ImageRef): Promise<void> {
  if (!ref.mime) {
    throw usageError(
      `unsupported image type for ${ref.original} (allowed: png, jpg, jpeg, webp, gif, avif)`,
    );
  }

  let stats;
  try {
    stats = await lstat(ref.absolutePath);
  } catch {
    throw usageError(`local image not found: ${ref.original}`);
  }

  if (stats.isSymbolicLink()) {
    throw usageError(`refusing to upload symbolic link: ${ref.original}`);
  }

  if (!stats.isFile()) {
    throw usageError(`local image not found: ${ref.original}`);
  }

  if (stats.size > MAX_IMAGE_BYTES) {
    throw new CliError(
      `local image is too large: ${ref.original} (${stats.size} bytes; maximum ${MAX_IMAGE_BYTES})`,
      EXIT.VALIDATION,
      { code: 'validation_failed' },
    );
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
  // Quantifiers are bounded to avoid super-linear backtracking on hostile
  // input; these limits are far above any real image reference.
  return /!\[([^\]\n]{0,1000})\]\(\s*(<[^>\n]{1,2048}>|[^)\s]{1,2048})(\s+(?:"[^"\n]{0,1000}"|'[^'\n]{0,1000}'|\([^)\n]{0,1000}\)))?\s*\)/g;
}
