import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import { lexicalToMarkdown, markdownToLexical } from '../markdown';
import { resolveLexicalContent } from '../v1';
import {
  editorPlaceholderLinkMarkdown,
  editorPlaceholderLinkState,
} from './fixtures/editorState';

/**
 * Structural view that ignores re-serialization metadata (`version`, CodeNode
 * `theme`) and treats a missing field and `null`/`undefined` as equal.
 */
function canonical(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(canonical);
  if (node === undefined) return null;
  if (typeof node !== 'object' || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'version' || key === 'theme') continue;
    out[key] = canonical(value);
  }
  return out;
}

describe('web editor placeholder link', () => {
  it('accepts a scheme-only https:// link and round-trips it', () => {
    const resolved = resolveLexicalContent({
      content_lexical: editorPlaceholderLinkState,
    });
    expect(canonical(resolved)).toStrictEqual(
      canonical(editorPlaceholderLinkState),
    );
    const markdown = lexicalToMarkdown(resolved);
    expect(markdown).toBe(editorPlaceholderLinkMarkdown);

    // lexical -> markdown -> lexical -> markdown is stable, and the link URL
    // survives the trip through the placeholder.
    const viaMarkdown = markdownToLexical(markdown);
    expect(lexicalToMarkdown(viaMarkdown)).toBe(editorPlaceholderLinkMarkdown);
    expect(JSON.stringify(viaMarkdown)).toContain('"url":"https://"');
  });

  it('does not accept arbitrary scheme-only or malformed URLs', () => {
    for (const url of ['javascript:', 'https:', 'http:/', 'ftp://']) {
      const error = (() => {
        try {
          resolveLexicalContent({
            content_lexical: {
              root: {
                type: 'root',
                children: [
                  {
                    type: 'link',
                    url,
                    children: [{ type: 'text', text: 'x' }],
                  },
                ],
              },
            },
          });
          return null;
        } catch (caught) {
          return caught as ApiError;
        }
      })();
      expect(error?.code, url).toBe('validation_failed');
    }
  });
});
