import { describe, expect, it, vi } from 'vitest';
import type { SerializedEditorState } from 'lexical';
import { ApiError } from '../errors';
import {
  lexicalToMarkdown,
  markdownToLexical,
  MAX_MARKDOWN_BLOCK_CHARS,
} from '../markdown';
import { MAX_LEXICAL_BYTES, resolveLexicalContent } from '../v1';
import { editorPostState } from './fixtures/editorState';

function state(children: unknown[]): SerializedEditorState {
  return { root: { type: 'root', children } } as unknown as SerializedEditorState;
}

function resolve(input: { content_lexical?: unknown }) {
  return resolveLexicalContent(input as never);
}

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

describe('resolveLexicalContent', () => {
  it('round-trips legitimate editor JSON unchanged in structure', () => {
    const resolved = resolve({ content_lexical: editorPostState });
    expect(canonical(resolved)).toStrictEqual(canonical(editorPostState));
    expect(lexicalToMarkdown(resolved)).toBe(
      lexicalToMarkdown(editorPostState),
    );
  });

  it('round-trips markdownToLexical output unchanged', () => {
    const fromMarkdown = markdownToLexical('# Hi\n\n- a\n- b');
    const normalized = resolveLexicalContent({ content_markdown: '# Hi\n\n- a\n- b' });
    expect(normalized).toStrictEqual(fromMarkdown);
  });

  it('drops unknown fields via the editor round trip', () => {
    const input = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'hi', evil: 'drop' }],
            alsoEvil: true,
          },
        ],
      },
    };
    const normalized = resolve({ content_lexical: input });
    const paragraphNode = normalized.root.children[0] as unknown as Record<
      string,
      unknown
    >;
    expect(paragraphNode.alsoEvil).toBeUndefined();
    const textNode = (paragraphNode.children as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(textNode.evil).toBeUndefined();
    expect(textNode.text).toBe('hi');
  });

  it('rejects an unknown node type with paths and types', () => {
    const input = state([
      { type: 'paragraph', children: [{ type: 'script', text: 'alert(1)' }] },
    ]);
    const error = (() => {
      try {
        resolve({ content_lexical: input });
        return null;
      } catch (caught) {
        return caught as ApiError;
      }
    })();

    expect(error).toBeInstanceOf(ApiError);
    expect(error?.code).toBe('validation_failed');
    expect(error?.details).toMatchObject({
      disallowed_nodes: [
        { path: 'root.children[0].children[0]', type: 'script' },
      ],
    });
    const fields = (error?.details as { fields: Record<string, string[]> }).fields;
    expect(fields.content_lexical[0]).toContain('script');
    expect(fields.content_lexical[0]).toContain(
      'root.children[0].children[0]',
    );
  });

  it('rejects a state that cannot be parsed by the editor', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = (() => {
      try {
        // All node types are allow-listed, but a root nested inside root is not
        // a valid editor state and the parser throws.
        resolve({
          content_lexical: state([{ type: 'root', children: [] }]),
        });
        return null;
      } catch (caught) {
        return caught as ApiError;
      }
    })();
    expect(error).toBeInstanceOf(ApiError);
    expect(error?.code).toBe('validation_failed');
  });

  it('checks the size limit before parsing', () => {
    const huge = 'x'.repeat(MAX_LEXICAL_BYTES);
    const error = (() => {
      try {
        resolve({
          content_lexical: state([
            { type: 'script', children: [{ type: 'text', text: huge }] },
          ]),
        });
        return null;
      } catch (caught) {
        return caught as ApiError;
      }
    })();
    expect(error?.code).toBe('validation_failed');
    const fields = (error?.details as { fields: Record<string, string[]> }).fields;
    expect(fields.content_lexical[0]).toContain('at most');
    expect((error?.details as Record<string, unknown>).disallowed_nodes).toBeUndefined();
  });

  it('rejects unsafe URLs on the normalized result', () => {
    const error = (() => {
      try {
        resolve({
          content_lexical: state([
            {
              type: 'link',
              url: 'javascript:alert(1)',
              children: [{ type: 'text', text: 'x' }],
            },
          ]),
        });
        return null;
      } catch (caught) {
        return caught as ApiError;
      }
    })();
    expect(error?.code).toBe('validation_failed');
    expect(
      (error?.details as { unsafe_urls: unknown[] }).unsafe_urls.length,
    ).toBeGreaterThan(0);
  });

  it('accepts a valid state built from markdown', () => {
    const resolved = resolve({ content_lexical: markdownToLexical('# Hi') });
    expect(resolved.root.children[0]).toMatchObject({ type: 'heading', tag: 'h1' });
  });
});

describe('resolveLexicalContent markdown block limit', () => {
  function resolveMarkdown(markdown: string) {
    return resolveLexicalContent({ content_markdown: markdown });
  }

  it('rejects an oversized paragraph with a clear message', () => {
    const error = (() => {
      try {
        resolveMarkdown('a'.repeat(MAX_MARKDOWN_BLOCK_CHARS + 1));
        return null;
      } catch (caught) {
        return caught as ApiError;
      }
    })();
    expect(error?.code).toBe('validation_failed');
    const fields = (error?.details as { fields: Record<string, string[]> }).fields;
    expect(fields.content_markdown[0]).toMatch(
      /a paragraph exceeds \d+ characters/,
    );
  });

  it('accepts a fenced code block larger than the block limit', () => {
    const resolved = resolveMarkdown(
      '```\n' + 'a'.repeat(MAX_MARKDOWN_BLOCK_CHARS * 5) + '\n```',
    );
    expect(resolved.root.type).toBe('root');
  });
});
