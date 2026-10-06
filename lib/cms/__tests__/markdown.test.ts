import { describe, expect, it } from 'vitest';
import { createHeadlessEditor } from '@lexical/headless';
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
  lexicalToMarkdown,
  markdownToLexical,
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
    expect(html).toContain('<img');
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

describe('empty input', () => {
  it('returns a valid empty root', () => {
    const state = markdownToLexical(emptyMarkdown);
    expect(isValidLexicalState(state)).toBe(true);
    expect(state.root.type).toBe('root');
    expect(lexicalToMarkdown(state)).toBe('');
  });
});
