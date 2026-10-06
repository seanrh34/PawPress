/**
 * Headless Markdown <-> Lexical conversion for the PawPress CLI/API.
 *
 * Design decisions
 * ----------------
 * - Uses `createHeadlessEditor` from `@lexical/headless` plus
 *   `$convertFromMarkdownString` / `$convertToMarkdownString` from
 *   `@lexical/markdown`. A brand-new editor is created for every call so there
 *   is no shared mutable state.
 * - Only node types registered by the web editor (`components/Editor.tsx`) are
 *   ever produced: root, paragraph, text, linebreak, tab, heading, list,
 *   listitem, quote, code, code-highlight, table, tablecell, tablerow, link,
 *   image, youtube. In particular no `autolink` or `horizontalrule` nodes are
 *   emitted; plain URLs stay as text.
 * - `image` and `youtube` use the server-safe node classes in
 *   `lib/cms/lexicalNodes.ts` whose `getType()`/`exportJSON()` match the React
 *   decorator nodes used by the web editor.
 * - GFM tables are supported both ways: a contiguous run of `| a | b |` rows
 *   with a `| --- |` divider is imported as a `table` node (header row cells get
 *   `headerState: ROW`), and `table` nodes are exported back to GFM. Lexical
 *   0.38's bundled transformers do not include tables, so this is a custom
 *   transformer. Alignment markers (`:--:`) are accepted on import but not
 *   persisted (Lexical 0.38 table cells have no alignment field) and the export
 *   always emits `---` separators.
 * - `image` and `youtube` are inline DecoratorNodes (Lexical 0.38's
 *   `DecoratorNode.isInline()` returns true and neither web node overrides it),
 *   so editor JSON places them inside paragraphs (`root > paragraph > image`).
 *   Both are handled by TextMatchTransformers, which keeps that shape: an image
 *   converts inline and when alone on a line (a paragraph whose only child is
 *   the image); a YouTube URL only converts when it is the whole paragraph.
 */

import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { createHeadlessEditor } from '@lexical/headless';
import { LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  ELEMENT_TRANSFORMERS,
  LINK,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  type MultilineElementTransformer,
  type TextMatchTransformer,
  type Transformer,
} from '@lexical/markdown';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@lexical/table';
import {
  $createParagraphNode,
  $createTextNode,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type SerializedEditorState,
} from 'lexical';

import {
  $createImageNode,
  $createYoutubeNode,
  $isImageNode,
  $isYoutubeNode,
  ServerImageNode,
  ServerYoutubeNode,
} from './lexicalNodes';

const EDITOR_NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  CodeNode,
  CodeHighlightNode,
  LinkNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  ServerImageNode,
  ServerYoutubeNode,
];

/**
 * `![alt](src)` -> inline `image` node. A TextMatchTransformer is used (not an
 * element transformer) because the editor's image node is an inline
 * DecoratorNode inserted with `$insertNodes`, so editor-shaped JSON is
 * `root > paragraph > image`. This handles images inline among text as well as
 * an image alone on a line (which becomes a paragraph whose only child is the
 * image). Must run before LINK so `![...](...)` is not split into `!` + link.
 */
const IMAGE: TextMatchTransformer = {
  dependencies: [ServerImageNode],
  export: (node) => {
    if (!$isImageNode(node)) {
      return null;
    }
    return `![${node.__altText}](${node.__src})`;
  },
  importRegExp: /!\[([^\]]*)\]\(([^)\s]+)\)/,
  regExp: /!\[([^\]]*)\]\(([^)\s]+)\)$/,
  replace: (textNode, match) => {
    const [, altText, src] = match;
    if (!src) {
      return;
    }
    textNode.replace($createImageNode({ altText, src }));
  },
  trigger: ')',
  type: 'text-match',
};

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * A paragraph consisting solely of a YouTube URL in any of the common shapes:
 * youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, with optional
 * `www.`/`m.`, http/https and ignored extra query parameters. The anchor keeps
 * embedded URLs as plain text; the replacement is inline so the result is
 * `paragraph > youtube`, matching the editor.
 */
const YOUTUBE_URL_REG_EXP =
  /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[&#?][^\s]*)?/;

const YOUTUBE: TextMatchTransformer = {
  dependencies: [ServerYoutubeNode],
  export: (node) => {
    if (!$isYoutubeNode(node)) {
      return null;
    }
    return `https://www.youtube.com/watch?v=${node.__id}`;
  },
  importRegExp: new RegExp(`^[ \\t]*${YOUTUBE_URL_REG_EXP.source}[ \\t]*$`),
  regExp: new RegExp(`${YOUTUBE_URL_REG_EXP.source}$`),
  replace: (textNode, match) => {
    const id = match[1];
    if (!id || !YOUTUBE_ID_PATTERN.test(id)) {
      return;
    }
    textNode.replace($createYoutubeNode({ id }));
  },
  type: 'text-match',
};

function createParagraphWithText(text: string): ElementNode {
  const paragraph = $createParagraphNode();
  paragraph.append($createTextNode(text));
  return paragraph;
}

const TABLE_ROW_REG_EXP = /^[ \t]*\|(.*)\|[ \t]*$/;

function isTableDivider(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) {
    return false;
  }
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  const parts = inner.split('|');
  return (
    parts.length > 0 &&
    parts.every((part) => /^[ \t]*:?-+:?[ \t]*$/.test(part))
  );
}

function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((cell) => cell.trim());
}

function escapeTableCell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

const TABLE: MultilineElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export: (node, exportChildren) => {
    if (!$isTableNode(node)) {
      return null;
    }
    const rows = node.getChildren().filter($isTableRowNode);
    if (rows.length === 0) {
      return '<!-- pawpress:table unsupported in markdown; use --format lexical -->';
    }
    const cellsOf = (row: TableRowNode): string[] =>
      row
        .getChildren()
        .filter($isTableCellNode)
        .map((cell) => escapeTableCell(exportChildren(cell)));
    const firstRowCells = cellsOf(rows[0]);
    const firstRowIsHeader = rows[0]
      .getChildren()
      .filter($isTableCellNode)
      .some((cell) => cell.hasHeaderState(TableCellHeaderStates.ROW));
    const headerCells = firstRowIsHeader
      ? firstRowCells
      : firstRowCells.map(() => '');
    const bodyRows = firstRowIsHeader
      ? rows.slice(1).map(cellsOf)
      : rows.map(cellsOf);
    const width = Math.max(
      1,
      headerCells.length,
      ...bodyRows.map((row) => row.length),
    );
    const pad = (row: string[]): string[] => {
      const padded = row.slice(0, width);
      while (padded.length < width) {
        padded.push('');
      }
      return padded;
    };
    const lines = [
      `| ${pad(headerCells).join(' | ')} |`,
      `| ${pad(headerCells).map(() => '---').join(' | ')} |`,
    ];
    for (const row of bodyRows) {
      lines.push(`| ${pad(row).join(' | ')} |`);
    }
    return lines.join('\n');
  },
  regExpStart: TABLE_ROW_REG_EXP,
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
    const headerLine = lines[startLineIndex];
    const dividerLine = lines[startLineIndex + 1];
    if (!headerLine || !dividerLine || !isTableDivider(dividerLine)) {
      return null;
    }
    const headerCells = splitTableRow(headerLine);
    const bodyCells: string[][] = [];
    let endLineIndex = startLineIndex + 1;
    for (let i = startLineIndex + 2; i < lines.length; i++) {
      const line = lines[i];
      if (!TABLE_ROW_REG_EXP.test(line) || isTableDivider(line)) {
        break;
      }
      bodyCells.push(splitTableRow(line));
      endLineIndex = i;
    }

    const table = $createTableNode();
    const headerRow = $createTableRowNode();
    for (const text of headerCells) {
      const cell = $createTableCellNode(TableCellHeaderStates.ROW);
      cell.append(createParagraphWithText(text));
      headerRow.append(cell);
    }
    table.append(headerRow);
    for (const row of bodyCells) {
      const rowNode = $createTableRowNode();
      for (let column = 0; column < headerCells.length; column++) {
        const cell = $createTableCellNode(TableCellHeaderStates.NO_STATUS);
        cell.append(createParagraphWithText(row[column] ?? ''));
        rowNode.append(cell);
      }
      table.append(rowNode);
    }
    rootNode.append(table);
    return [true, endLineIndex];
  },
  replace: () => false,
  type: 'multiline-element',
};

const MARKDOWN_TRANSFORMERS: Transformer[] = [
  ...ELEMENT_TRANSFORMERS,
  ...MULTILINE_ELEMENT_TRANSFORMERS,
  TABLE,
  ...TEXT_FORMAT_TRANSFORMERS,
  // IMAGE before LINK: `![alt](src)` also matches the link pattern from the
  // `[alt](src)` tail, and the first transformer with the earliest match wins.
  IMAGE,
  YOUTUBE,
  LINK,
];

function createEditor(): LexicalEditor {
  return createHeadlessEditor({
    namespace: 'PawPressMarkdown',
    nodes: EDITOR_NODES,
    onError: (error: Error) => {
      throw error;
    },
  });
}

export function markdownToLexical(markdown: string): SerializedEditorState {
  const editor = createEditor();
  editor.update(
    () => {
      $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS);
    },
    { discrete: true },
  );
  return editor.getEditorState().toJSON();
}

export function lexicalToMarkdown(state: SerializedEditorState): string {
  const editor = createEditor();
  editor.setEditorState(editor.parseEditorState(state));
  return editor
    .getEditorState()
    .read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS));
}

/**
 * The node types the web editor is able to render. Exported for content-safety
 * and tests so the pipeline can assert it never emits anything else.
 */
export const ALLOWED_NODE_TYPES: ReadonlySet<string> = new Set([
  'root',
  'paragraph',
  'text',
  'linebreak',
  'tab',
  'heading',
  'list',
  'listitem',
  'quote',
  'code',
  'code-highlight',
  'table',
  'tablecell',
  'tablerow',
  'link',
  'image',
  'youtube',
]);

export type { LexicalNode };
