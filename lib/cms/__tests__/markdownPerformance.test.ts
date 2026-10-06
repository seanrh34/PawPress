import { describe, expect, it } from 'vitest';
import {
  findOversizedMarkdownBlock,
  MarkdownBlockTooLongError,
  markdownToLexical,
  MAX_MARKDOWN_BLOCK_CHARS,
} from '../markdown';

/**
 * Performance regression guard for the Markdown importer.
 *
 * Lexical's `$runTextFormatTransformers` is quadratic in the size of a single
 * text block: `'*'.repeat(20_000)` as one paragraph settles at ~0.6 s, 10 such
 * paragraphs at ~6 s, and a single 100k paragraph throws
 * "Maximum call stack size exceeded" after ~12.5 s. `markdownToLexical` now
 * rejects any block over `MAX_MARKDOWN_BLOCK_CHARS` (see
 * `findOversizedMarkdownBlock`), which bounds the per-request cost. The chosen
 * limit of 10 000 keeps the worst case (10 blocks) around 1.6 s here.
 *
 * Oversized blocks in the earlier IMAGE/LINK regex path are also rejected
 * before conversion.
 */
const BUDGET_MS = 3000;
const LIMIT = MAX_MARKDOWN_BLOCK_CHARS;

function elapsed(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function blocks(count: number, block: string): string {
  return Array.from({ length: count }, () => block).join('\n\n');
}

describe('markdown importer performance', () => {
  it('rejects an oversized single block immediately', () => {
    expect(() => markdownToLexical('*'.repeat(LIMIT + 1))).toThrow(
      MarkdownBlockTooLongError,
    );
    const duration = elapsed(() => {
      try {
        markdownToLexical('*'.repeat(100_000));
      } catch {
        // expected
      }
    });
    expect(duration).toBeLessThan(500);
  });

  it('converts the worst-case emphasis block at the limit under budget', () => {
    const duration = elapsed(() => markdownToLexical('*'.repeat(LIMIT)));
    expect(duration).toBeLessThan(BUDGET_MS);
  });

  it('converts ten emphasis blocks at the limit under budget', () => {
    const doc = blocks(10, '*'.repeat(LIMIT - 1));
    const duration = elapsed(() => markdownToLexical(doc));
    expect(duration).toBeLessThan(BUDGET_MS);
  });

  it('exempts fenced code blocks from the per-block limit', () => {
    const doc = '```\n' + 'a'.repeat(LIMIT * 3) + '\n```';
    expect(findOversizedMarkdownBlock(doc)).toBeNull();
    expect(() => markdownToLexical(doc)).not.toThrow();
  });

  it('still rejects an oversized paragraph next to a fenced block', () => {
    const doc =
      '```\n' + 'a'.repeat(LIMIT * 2) + '\n```\n\n' + 'b'.repeat(LIMIT + 1);
    expect(() => markdownToLexical(doc)).toThrow(MarkdownBlockTooLongError);
  });

  it.each([
    ['plain text', 'a'.repeat(LIMIT)],
    ['open brackets', '['.repeat(LIMIT)],
    ['pipes', '|'.repeat(LIMIT)],
    ['list markers', '- '.repeat(LIMIT / 2)],
    ['many link candidates', '[a]('.repeat(LIMIT / 4)],
  ])('handles %s at the limit under budget', (_name, input) => {
    const duration = elapsed(() => markdownToLexical(input));
    expect(duration).toBeLessThan(BUDGET_MS);
  });
});
