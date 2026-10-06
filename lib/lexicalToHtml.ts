import { SerializedEditorState } from 'lexical';
import { isAllowedImageUrl, isAllowedLinkUrl } from './cms/contentSafety';

/**
 * Loose shape for serialized Lexical nodes: this converter is deliberately
 * tolerant of any node type and only reads the fields it needs. Every field is
 * treated as untrusted because v1 `content_lexical` is only shape-checked
 * before it reaches this XSS sink.
 */
interface SerializedNodeLike {
  type?: string;
  text?: unknown;
  format?: unknown;
  tag?: unknown;
  listType?: unknown;
  url?: unknown;
  target?: unknown;
  rel?: unknown;
  src?: unknown;
  altText?: unknown;
  width?: unknown;
  height?: unknown;
  id?: unknown;
  videoID?: unknown;
  headerState?: unknown;
  children?: unknown;
}

const HEADING_TAGS: ReadonlySet<string> = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const NUMERIC_DIMENSION_PATTERN = /^\d{1,5}$/;

/**
 * Recursion guard for pathologically nested (possibly hostile) states.
 * Legitimate editor content is nowhere near this deep.
 */
const MAX_NODE_DEPTH = 200;

/**
 * Escape HTML special characters. Every dynamic value that ends up on the page
 * goes through here; tag names (below) never do.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Only h1–h6 may be used as element names; anything else collapses to h2. The
 * raw value is never interpolated.
 */
function safeHeadingTag(tag: unknown): string {
  return typeof tag === 'string' && HEADING_TAGS.has(tag) ? tag : 'h2';
}

/**
 * The editor stores `width`/`height` as a positive number or the literal
 * 'inherit'. Only emit a dimension attribute for a finite positive number or a
 * short numeric string; refuse anything else (e.g. `1" onerror="…`).
 */
function safeDimension(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(value);
  }
  if (typeof value === 'string' && NUMERIC_DIMENSION_PATTERN.test(value)) {
    return value;
  }
  return null;
}

function safeFormat(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Apply text formatting based on node format. The wrapper tags are a fixed
 * allowlist; only `text` is dynamic and it is already escaped.
 */
function applyTextFormat(text: string, format?: number): string {
  if (!format) return text;

  let result = text;

  // Format flags from Lexical
  const IS_BOLD = 1;
  const IS_ITALIC = 1 << 1;
  const IS_STRIKETHROUGH = 1 << 2;
  const IS_UNDERLINE = 1 << 3;
  const IS_CODE = 1 << 4;
  const IS_SUBSCRIPT = 1 << 5;
  const IS_SUPERSCRIPT = 1 << 6;

  if (format & IS_BOLD) result = `<strong>${result}</strong>`;
  if (format & IS_ITALIC) result = `<em>${result}</em>`;
  if (format & IS_STRIKETHROUGH) result = `<s>${result}</s>`;
  if (format & IS_UNDERLINE) result = `<u>${result}</u>`;
  if (format & IS_CODE) result = `<code>${result}</code>`;
  if (format & IS_SUBSCRIPT) result = `<sub>${result}</sub>`;
  if (format & IS_SUPERSCRIPT) result = `<sup>${result}</sup>`;

  return result;
}

function renderChildren(node: SerializedNodeLike, depth: number): string {
  if (!Array.isArray(node.children)) {
    return '';
  }
  return node.children.map((child) => nodeToHtml(child, depth + 1)).join('');
}

/**
 * Convert a single Lexical node to HTML. `node` is unknown because it comes
 * from untrusted JSON; anything that is not an object is ignored.
 */
function nodeToHtml(node: unknown, depth: number): string {
  if (depth > MAX_NODE_DEPTH || !isRecord(node)) {
    return '';
  }

  const type = node.type;

  // Text node
  if (type === 'text') {
    const text = escapeHtml(asString(node.text));
    return applyTextFormat(text, safeFormat(node.format));
  }

  // Line break
  if (type === 'linebreak') {
    return '<br>';
  }

  // Paragraph
  if (type === 'paragraph') {
    return `<p>${renderChildren(node, depth)}</p>`;
  }

  // Headings
  if (type === 'heading') {
    const tag = safeHeadingTag(node.tag);
    return `<${tag}>${renderChildren(node, depth)}</${tag}>`;
  }

  // Quote
  if (type === 'quote') {
    return `<blockquote>${renderChildren(node, depth)}</blockquote>`;
  }

  // List
  if (type === 'list') {
    const tag = node.listType === 'number' ? 'ol' : 'ul';
    return `<${tag}>${renderChildren(node, depth)}</${tag}>`;
  }

  // List item
  if (type === 'listitem') {
    return `<li>${renderChildren(node, depth)}</li>`;
  }

  // Code block
  if (type === 'code') {
    const children = Array.isArray(node.children)
      ? node.children
          .map((child) => {
            if (
              isRecord(child) &&
              (child.type === 'text' || child.type === 'code-highlight')
            ) {
              return escapeHtml(asString(child.text));
            }
            return nodeToHtml(child, depth + 1);
          })
          .join('')
      : '';
    return `<pre><code>${children}</code></pre>`;
  }

  // Link
  if (type === 'link') {
    const children = renderChildren(node, depth);
    const url = asString(node.url);
    if (!isAllowedLinkUrl(url)) {
      // Drop the anchor but keep its text rather than ever emitting a hostile
      // href (e.g. `javascript:`).
      return children;
    }
    const target = node.target ? ` target="${escapeHtml(asString(node.target))}"` : '';
    const rel = node.rel ? ` rel="${escapeHtml(asString(node.rel))}"` : '';
    return `<a href="${escapeHtml(url)}"${target}${rel}>${children}</a>`;
  }

  // Image
  if (type === 'image') {
    const src = asString(node.src);
    if (!isAllowedImageUrl(src)) {
      return '';
    }
    const alt = escapeHtml(asString(node.altText));
    const width = safeDimension(node.width);
    const height = safeDimension(node.height);
    const widthAttr = width === null ? '' : ` width="${width}"`;
    const heightAttr = height === null ? '' : ` height="${height}"`;
    return `<img src="${escapeHtml(src)}" alt="${alt}"${widthAttr}${heightAttr} />`;
  }

  // YouTube embed
  if (type === 'youtube') {
    // The editor's YoutubeNode serializes the id as `id`; keep `videoID` as a
    // fallback for any previously stored content.
    const videoId = asString(node.id) || asString(node.videoID);
    if (!YOUTUBE_ID_PATTERN.test(videoId)) {
      return '';
    }
    return `<div class="youtube-embed"><iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }

  // Table
  if (type === 'table') {
    return `<table>${renderChildren(node, depth)}</table>`;
  }

  if (type === 'tablerow') {
    return `<tr>${renderChildren(node, depth)}</tr>`;
  }

  if (type === 'tablecell') {
    const tag = node.headerState ? 'th' : 'td';
    return `<${tag}>${renderChildren(node, depth)}</${tag}>`;
  }

  // Unknown node type - try to render children
  if (node.children) {
    return renderChildren(node, depth);
  }

  return '';
}

/**
 * Convert Lexical SerializedEditorState to HTML string
 * This is a pure JSON-to-HTML converter that doesn't require DOM libraries
 */
export async function lexicalToHtml(editorState: SerializedEditorState): Promise<string> {
  try {
    const root = isRecord(editorState) ? editorState.root : undefined;
    if (!isRecord(root) || !Array.isArray(root.children)) {
      return '';
    }

    return root.children
      .map((child) => nodeToHtml(child, 0))
      .join('');
  } catch (error) {
    console.error('Failed to convert Lexical to HTML:', error);
    throw error;
  }
}
