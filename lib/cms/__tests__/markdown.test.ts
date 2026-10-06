import { describe, expect, it } from 'vitest';
import { createHeadlessEditor } from '@lexical/headless';
import { $createParagraphNode, $getRoot } from 'lexical';
import type { Klass, LexicalNode, SerializedEditorState } from 'lexical';
import { lexicalToHtml } from '@/lib/lexicalToHtml';
import {
  ImageNode as WebImageNode,
  $createImageNode as $createWebImageNode,
} from '@/app/admin/lexical/nodes/ImageNode';
import {
  YoutubeNode as WebYoutubeNode,
  $createYoutubeNode as $createWebYoutubeNode,
} from '@/app/admin/lexical/nodes/YoutubeNode';
import {
  ALLOWED_NODE_TYPES,
  findDisallowedNodeTypes,
  lexicalToMarkdown,
  markdownToLexical,
  normalizeLexicalState,
} from '../markdown';
import {
  ServerImageNode,
  ServerYoutubeNode,
  $createImageNode as $createServerImageNode,
  $createYoutubeNode as $createServerYoutubeNode,
} from '../lexicalNodes';
import { isValidLexicalState } from '../contentSafety';
import {
  blockQuoteMarkdown,
  emptyMarkdown,
  fencedCodeMarkdown,
  headingsMarkdown,
  imageMarkdown,
  inlineFormattingMarkdown,
  linksMarkdown,
  nestedListMarkdown,
  notAYoutubeUrlMarkdown,
  orderedListMarkdown,
  realisticPostMarkdown,
  tableMarkdown,
  unorderedListMarkdown,
  youtubeMarkdown,
  youtubeUrlForms,
} from './fixtures/samples';
import { editorPostMarkdown, editorPostState } from './fixtures/editorState';

interface SerializedNodeLike {
  type?: unknown;
  children?: unknown;
}

function collectNodeTypes(state: SerializedEditorState): Set<string> {
  const types = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) {
      return;
    }
    const record = node as SerializedNodeLike;
    if (typeof record.type === 'string') {
      types.add(record.type);
    }
    if (Array.isArray(record.children)) {
      record.children.forEach(walk);
    }
  };
  walk(state.root);
  return types;
}

function findNodeByType(
  state: SerializedEditorState,
  type: string,
): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) {
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.type === type) {
      found.push(record);
    }
    if (Array.isArray(record.children)) {
      record.children.forEach(walk);
    }
  };
  walk(state.root);
  return found;
}

function edgeStable(markdown: string): { once: string; twice: string } {
  const once = lexicalToMarkdown(markdownToLexical(markdown));
  const twice = lexicalToMarkdown(markdownToLexical(once));
  return { once, twice };
}

/**
 * Comparable view of an editor state that ignores re-serialization metadata
 * (`version`, CodeNode `theme`) and treats a missing field and an explicit
 * `null`/`undefined` as equal. Used to assert a round trip preserves structure
 * without pinning incidental serialization details.
 */
function canonical(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(canonical);
  }
  if (node === undefined) {
    return null;
  }
  if (typeof node !== 'object' || node === null) {
    return node;
  }
  const record = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'version' || key === 'theme') continue;
    out[key] = canonical(value);
  }
  return out;
}

function buildWithNodes<T>(nodes: Klass<LexicalNode>[], fn: () => T): T {
  const editor = createHeadlessEditor({
    namespace: 'node-json-test',
    nodes,
    onError: (error: Error) => {
      throw error;
    },
  });
  let result: T | undefined;
  editor.update(
    () => {
      result = fn();
    },
    { discrete: true },
  );
  if (result === undefined) {
    throw new Error('buildWithNodes produced no result');
  }
  return result;
}

/**
 * Builds editor JSON the way the web editor does: inline decorator nodes are
 * `$insertNodes`-ed into paragraphs, so the shape is root > paragraph > node.
 */
function webEditorShapeState(): SerializedEditorState {
  const editor = createHeadlessEditor({
    namespace: 'web-editor-shape',
    nodes: [WebImageNode, WebYoutubeNode],
    onError: (error: Error) => {
      throw error;
    },
  });
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      const imageParagraph = $createParagraphNode();
      imageParagraph.append(
        $createWebImageNode({ altText: 'A cat', src: '/images/cat.png' }),
      );
      root.append(imageParagraph);
      const youtubeParagraph = $createParagraphNode();
      youtubeParagraph.append($createWebYoutubeNode({ id: 'dQw4w9WgXcQ' }));
      root.append(youtubeParagraph);
    },
    { discrete: true },
  );
  return editor.getEditorState().toJSON();
}

describe('markdownToLexical -> lexicalToMarkdown round trips', () => {
  it('preserves headings h1-h6', () => {
    expect(edgeStable(headingsMarkdown).once).toBe(headingsMarkdown);
  });

  it('preserves bold, italic, strikethrough and inline code', () => {
    expect(edgeStable(inlineFormattingMarkdown).once).toBe(
      inlineFormattingMarkdown,
    );
  });

  it('preserves links', () => {
    expect(edgeStable(linksMarkdown).once).toBe(linksMarkdown);
  });

  it('preserves unordered, ordered and nested lists', () => {
    expect(edgeStable(unorderedListMarkdown).once).toBe(unorderedListMarkdown);
    expect(edgeStable(orderedListMarkdown).once).toBe(orderedListMarkdown);
    expect(edgeStable(nestedListMarkdown).once).toBe(nestedListMarkdown);
  });

  it('produces nested list nodes for indented items', () => {
    const state = markdownToLexical(nestedListMarkdown);
    const lists = findNodeByType(state, 'list');
    expect(lists.length).toBeGreaterThan(1);
  });

  it('preserves block quotes', () => {
    expect(edgeStable(blockQuoteMarkdown).once).toBe(blockQuoteMarkdown);
  });

  it('preserves fenced code blocks and their language', () => {
    expect(edgeStable(fencedCodeMarkdown).once).toBe(fencedCodeMarkdown);
    const [code] = findNodeByType(
      markdownToLexical(fencedCodeMarkdown),
      'code',
    );
    expect(code?.language).toBe('ts');
  });

  it('preserves images', () => {
    expect(edgeStable(imageMarkdown).once).toBe(imageMarkdown);
  });

  it('converts an image inline among text', () => {
    const markdown = 'Before ![A cat](/a.png) after.';
    const state = markdownToLexical(markdown);
    const [image] = findNodeByType(state, 'image');
    expect(image?.src).toBe('/a.png');
    expect(lexicalToMarkdown(state)).toBe(markdown);
  });

  it('preserves GFM tables', () => {
    expect(edgeStable(tableMarkdown).once).toBe(tableMarkdown);
  });

  it('imports tables with a header row via headerState', () => {
    const state = markdownToLexical(tableMarkdown);
    const [table] = findNodeByType(state, 'table');
    const rows = (table?.children ?? []) as Array<Record<string, unknown>>;
    const headerCells = (rows[0]?.children ?? []) as Array<Record<string, unknown>>;
    const bodyCells = (rows[1]?.children ?? []) as Array<Record<string, unknown>>;
    expect(headerCells.map((cell) => cell.headerState)).toEqual([1, 1]);
    expect(bodyCells.map((cell) => cell.headerState)).toEqual([0, 0]);
  });

  it('is stable for a realistic mixed post', () => {
    const { once, twice } = edgeStable(realisticPostMarkdown);
    expect(twice).toBe(once);
    expect(once).toContain('# Deploying PawPress');
    expect(once).toContain('**Next.js**');
    expect(once).toContain('```bash');
    expect(once).toContain('![dashboard](/images/dashboard.png)');
    expect(once).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(once).toContain('| Feature | Status |');
  });
});

describe('list indentation normalisation', () => {
  it('normalises two-space bullet nesting', () => {
    expect(edgeStable('- a\n  - b').once).toBe('- a\n    - b');
  });

  it('normalises three-space ordered nesting', () => {
    expect(edgeStable('1. x\n   1. y').once).toBe('1. x\n    1. y');
  });

  it('normalises three levels of two-space bullets', () => {
    expect(edgeStable('- a\n  - b\n    - c').once).toBe(
      '- a\n    - b\n        - c',
    );
  });

  it('normalises three levels of ordered nesting', () => {
    expect(edgeStable('1. a\n   1. b\n      1. c').once).toBe(
      '1. a\n    1. b\n        1. c',
    );
  });

  it('normalises mixed ordered/unordered three levels', () => {
    // Lexical 0.38 cannot nest a list of a different type directly under
    // another (it emits them as separate top-level lists), so assert the
    // normaliser preserved the three indentation levels rather than flattening.
    const out = edgeStable('1. first\n   1. second\n      - third').once;
    expect(out).toContain('1. first');
    expect(out).toContain('    1. second');
    expect(out).toContain('        - third');
  });

  it('keeps four-space and tab nesting working', () => {
    expect(edgeStable('- a\n    - b').once).toBe('- a\n    - b');
    expect(edgeStable('- a\n\t- b').once).toBe('- a\n    - b');
  });

  it('softer siblings pop back to the right level', () => {
    expect(edgeStable('- a\n  - b\n- c').once).toBe('- a\n    - b\n- c');
  });

  it('does not touch list-looking lines inside fenced code', () => {
    const markdown = '```text\n  - x\n    - y\n```';
    expect(edgeStable(markdown).once).toBe(markdown);
  });
});

describe('YouTube URLs', () => {
  it.each(youtubeUrlForms)('normalises $input', ({ input, id }) => {
    const state = markdownToLexical(input);
    const [youtube] = findNodeByType(state, 'youtube');
    expect(youtube?.id).toBe(id);
    expect(lexicalToMarkdown(state)).toBe(
      `https://www.youtube.com/watch?v=${id}`,
    );
  });

  it('leaves non-11-character URLs as plain text', () => {
    const state = markdownToLexical(notAYoutubeUrlMarkdown);
    expect(findNodeByType(state, 'youtube')).toHaveLength(0);
    expect(lexicalToMarkdown(state)).toBe(notAYoutubeUrlMarkdown);
  });
});

describe('node type safety', () => {
  const inputs: Array<[string, string]> = [
    ['headings', headingsMarkdown],
    ['inline', inlineFormattingMarkdown],
    ['links', linksMarkdown],
    ['unordered list', unorderedListMarkdown],
    ['ordered list', orderedListMarkdown],
    ['nested list', nestedListMarkdown],
    ['quote', blockQuoteMarkdown],
    ['code', fencedCodeMarkdown],
    ['image', imageMarkdown],
    ['youtube', youtubeMarkdown],
    ['table', tableMarkdown],
    ['realistic', realisticPostMarkdown],
  ];

  it.each(inputs)('emits only editor node types for %s', (_name, markdown) => {
    for (const type of collectNodeTypes(markdownToLexical(markdown))) {
      expect(ALLOWED_NODE_TYPES.has(type)).toBe(true);
    }
  });

  it('never emits autolink or horizontalrule', () => {
    const markdown = 'https://example.com/plain\n\n---\n';
    const types = collectNodeTypes(markdownToLexical(markdown));
    expect(types.has('autolink')).toBe(false);
    expect(types.has('horizontalrule')).toBe(false);
  });
});

describe('lexicalToHtml integration', () => {
  it('renders the realistic post without throwing and with expected tags', async () => {
    const html = await lexicalToHtml(markdownToLexical(realisticPostMarkdown));
    expect(html).toContain('<h1>Deploying PawPress</h1>');
    expect(html).toContain('<strong>Next.js</strong>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('<p><img');
    expect(html).toContain('<table>');
    expect(html).toContain('<div class="youtube-embed">');
    expect(html).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });
});

describe('lexicalToMarkdown on real editor output', () => {
  it('converts a real-shaped editor state', () => {
    expect(lexicalToMarkdown(editorPostState)).toBe(editorPostMarkdown);
  });

  it('uses only allowed node types', () => {
    for (const type of collectNodeTypes(editorPostState)) {
      expect(ALLOWED_NODE_TYPES.has(type)).toBe(true);
    }
  });
});

describe('server-safe node JSON matches the web editor', () => {
  it('image exportJSON is identical', () => {
    const web = buildWithNodes([WebImageNode, WebYoutubeNode], () =>
      $createWebImageNode({ altText: 'a', src: '/x.png' }).exportJSON(),
    );
    const server = buildWithNodes([ServerImageNode, ServerYoutubeNode], () =>
      $createServerImageNode({ altText: 'a', src: '/x.png' }).exportJSON(),
    );
    expect(server).toStrictEqual(web);
    expect(server).toStrictEqual({
      altText: 'a',
      height: 'inherit',
      width: 'inherit',
      maxWidth: 400,
      src: '/x.png',
      type: 'image',
      version: 1,
    });
  });

  it('youtube exportJSON is identical', () => {
    const web = buildWithNodes([WebImageNode, WebYoutubeNode], () =>
      $createWebYoutubeNode({ id: 'dQw4w9WgXcQ' }).exportJSON(),
    );
    const server = buildWithNodes([ServerImageNode, ServerYoutubeNode], () =>
      $createServerYoutubeNode({ id: 'dQw4w9WgXcQ' }).exportJSON(),
    );
    expect(server).toStrictEqual(web);
    expect(server).toStrictEqual({
      id: 'dQw4w9WgXcQ',
      type: 'youtube',
      version: 1,
    });
  });

  it('is stable across repeated calls (no shared editor state)', () => {
    const first = markdownToLexical(realisticPostMarkdown);
    const second = markdownToLexical(realisticPostMarkdown);
    expect(second).toStrictEqual(first);
  });
});

describe('editor-shaped inline image/youtube JSON', () => {
  it('matches markdownToLexical and exports back', async () => {
    const editorState = webEditorShapeState();
    const markdown = '![A cat](/images/cat.png)\n\nhttps://youtu.be/dQw4w9WgXcQ';

    expect(markdownToLexical(markdown)).toStrictEqual(editorState);

    const out = lexicalToMarkdown(editorState);
    expect(out).toContain('![A cat](/images/cat.png)');
    expect(out).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const html = await lexicalToHtml(editorState);
    expect(html).toContain('<p><img');
  });
});

describe('empty input', () => {
  it('returns a valid empty root', () => {
    const state = markdownToLexical(emptyMarkdown);
    expect(isValidLexicalState(state)).toBe(true);
    expect(state.root.type).toBe('root');
    expect(lexicalToMarkdown(state)).toBe('');
  });
});

describe('normalizeLexicalState round trip', () => {
  it('preserves the real editor fixture structure exactly', () => {
    const normalized = normalizeLexicalState(editorPostState);
    expect(canonical(normalized)).toStrictEqual(canonical(editorPostState));
    expect(lexicalToMarkdown(normalized)).toBe(
      lexicalToMarkdown(editorPostState),
    );
  });

  it('is idempotent for every markdown shape the importer produces', () => {
    const inputs: Array<[string, string]> = [
      ['headings', headingsMarkdown],
      ['inline', inlineFormattingMarkdown],
      ['links', linksMarkdown],
      ['unordered list', unorderedListMarkdown],
      ['ordered list', orderedListMarkdown],
      ['nested list', nestedListMarkdown],
      ['quote', blockQuoteMarkdown],
      ['code', fencedCodeMarkdown],
      ['image', imageMarkdown],
      ['youtube', youtubeMarkdown],
      ['table', tableMarkdown],
      ['realistic', realisticPostMarkdown],
    ];

    for (const [name, markdown] of inputs) {
      const state = markdownToLexical(markdown);
      expect(normalizeLexicalState(state), name).toStrictEqual(state);
    }
  });

  it('drops unknown fields while keeping the node shape', () => {
    const state = markdownToLexical('Hello');
    const paragraph = state.root.children[0] as unknown as Record<
      string,
      unknown
    >;
    paragraph.evil = 'drop me';
    const normalized = normalizeLexicalState(state);
    const normalizedParagraph = normalized.root.children[0] as unknown as Record<
      string,
      unknown
    >;
    expect(normalizedParagraph.evil).toBeUndefined();
    expect(normalizedParagraph.type).toBe('paragraph');
  });
});

describe('findDisallowedNodeTypes', () => {
  it('returns nothing for allowed editor shapes', () => {
    expect(findDisallowedNodeTypes(editorPostState)).toEqual([]);
    expect(findDisallowedNodeTypes(markdownToLexical(realisticPostMarkdown))).toEqual([]);
  });

  it('reports the type and path of unknown nodes, including nested ones', () => {
    const state = {
      root: {
        type: 'root',
        children: [
          { type: 'paragraph', children: [{ type: 'script', text: 'x' }] },
          { type: 'mystery', children: [] },
        ],
      },
    };
    expect(findDisallowedNodeTypes(state)).toEqual([
      { path: 'root.children[0].children[0]', type: 'script' },
      { path: 'root.children[1]', type: 'mystery' },
    ]);
  });

  it('reports a missing type as (missing)', () => {
    const state = {
      root: { type: 'root', children: [{ children: [] }] },
    };
    expect(findDisallowedNodeTypes(state)).toEqual([
      { path: 'root.children[0]', type: '(missing)' },
    ]);
  });
});
