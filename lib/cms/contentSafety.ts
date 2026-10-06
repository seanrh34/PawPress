/**
 * Content URL safety checks for Lexical states written through the v1 API.
 *
 * Mirrors `docs/cli-api.md` §6:
 * - image `src` (and featured_image_url): `http(s)://…` or site-relative `/…`.
 *   `data:` URIs are rejected with a hint to upload via POST /api/v1/media.
 * - link `url`: `http(s):`, `mailto:`, site-relative `/…` (not `//`) or a
 *   `#fragment`. `javascript:`, `data:`, `vbscript:`, protocol-relative URLs and
 *   unparseable values are rejected.
 *
 * Schemes are trimmed and case-folded before checking, so `' JavaScript:…'`
 * is rejected. These helpers are pure and run in plain Node.
 */

import type { SerializedEditorState } from 'lexical';

export interface UnsafeUrl {
  path: string;
  nodeType: string;
  url: string;
  reason: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function schemeOf(url: string): string | null {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Browsers treat `\` like `/`, so `/\evil.com` resolves to the protocol-relative
 * `//evil.com`. Reject backslashes and any ASCII control/whitespace character
 * left inside the URL after the ends have been trimmed.
 */
function hasUnsafeChars(url: string): boolean {
  return /[\\\u0000-\u0020\u007F]/.test(url);
}

function isHttpUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}

export function isAllowedImageUrl(url: string): boolean {
  if (typeof url !== 'string') {
    return false;
  }
  const trimmed = url.trim();
  if (trimmed === '' || trimmed.startsWith('#')) {
    return false;
  }
  if (hasUnsafeChars(trimmed)) {
    return false;
  }
  if (trimmed.startsWith('//')) {
    return false;
  }
  if (trimmed.startsWith('/')) {
    return true;
  }
  return isHttpUrl(trimmed);
}

export function isAllowedLinkUrl(url: string): boolean {
  if (typeof url !== 'string') {
    return false;
  }
  const trimmed = url.trim();
  if (trimmed === '') {
    return false;
  }
  if (hasUnsafeChars(trimmed)) {
    return false;
  }
  if (trimmed.startsWith('#')) {
    return trimmed.length > 1;
  }
  if (trimmed.startsWith('//')) {
    return false;
  }
  if (trimmed.startsWith('/')) {
    return true;
  }
  const scheme = schemeOf(trimmed);
  if (scheme === 'http' || scheme === 'https') {
    return isHttpUrl(trimmed);
  }
  if (scheme === 'mailto') {
    return trimmed.length > 'mailto:'.length;
  }
  return false;
}

function imageReason(url: string): string {
  const trimmed = url.trim();
  if (/^data:/i.test(trimmed)) {
    return 'Image data: URIs are not allowed; upload images with POST /api/v1/media first';
  }
  if (trimmed === '') {
    return 'Image src is empty; use an http(s) URL or a site-relative path';
  }
  if (hasUnsafeChars(trimmed)) {
    return 'Image URL contains a backslash, whitespace or control character; use an http(s) URL or a site-relative path';
  }
  if (trimmed.startsWith('//')) {
    return 'Protocol-relative image URLs are not allowed; use http(s) or a site-relative path starting with a single "/"';
  }
  return 'Image src must be an http(s) URL or a site-relative path; upload images with POST /api/v1/media first';
}

function linkReason(url: string): string {
  const trimmed = url.trim();
  if (trimmed === '') {
    return 'Link URL is empty; use http(s), mailto, a site-relative path, or a #fragment';
  }
  if (hasUnsafeChars(trimmed)) {
    return 'Link URL contains a backslash, whitespace or control character; use http(s), mailto, a site-relative path, or a #fragment';
  }
  if (trimmed.startsWith('//')) {
    return 'Protocol-relative link URLs are not allowed; use http(s), mailto, a site-relative path, or a #fragment';
  }
  if (/^data:/i.test(trimmed)) {
    return 'data: link URLs are not allowed; use http(s), mailto, a site-relative path, or a #fragment';
  }
  const scheme = schemeOf(trimmed);
  if (scheme === 'javascript' || scheme === 'vbscript') {
    return `${scheme}: link URLs are not allowed; use http(s), mailto, a site-relative path, or a #fragment`;
  }
  return 'Link URL must be http(s), mailto, a site-relative path, or a #fragment';
}

function walkNodes(nodes: unknown[], basePath: string, out: UnsafeUrl[]): void {
  nodes.forEach((node, index) => {
    const path = `${basePath}[${index}]`;
    if (!isRecord(node)) {
      return;
    }
    const nodeType = typeof node.type === 'string' ? node.type : '';
    if (nodeType === 'image') {
      const url = typeof node.src === 'string' ? node.src : '';
      if (!isAllowedImageUrl(url)) {
        out.push({ path, nodeType, url, reason: imageReason(url) });
      }
    } else if (nodeType === 'link') {
      const url = typeof node.url === 'string' ? node.url : '';
      if (!isAllowedLinkUrl(url)) {
        out.push({ path, nodeType, url, reason: linkReason(url) });
      }
    }
    if (Array.isArray(node.children)) {
      walkNodes(node.children, `${path}.children`, out);
    }
  });
}

export function findUnsafeUrls(state: SerializedEditorState): UnsafeUrl[] {
  const out: UnsafeUrl[] = [];
  if (!isValidLexicalState(state)) {
    return out;
  }
  const root = state.root as unknown as Record<string, unknown>;
  const children = root.children;
  if (Array.isArray(children)) {
    walkNodes(children, 'root.children', out);
  }
  return out;
}

export function isValidLexicalState(x: unknown): x is SerializedEditorState {
  if (!isRecord(x)) {
    return false;
  }
  const root = x.root;
  if (!isRecord(root)) {
    return false;
  }
  return root.type === 'root' && Array.isArray(root.children);
}
