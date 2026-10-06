import { describe, expect, it } from 'vitest';
import { markdownToLexical } from '../markdown';

/**
 * Performance regression guard for the Markdown importer.
 *
 * Background: the original IMAGE transformer used `/!\[([^\]]*)\]\(([^)\s]+)\)/`,
 * which is O(n^2) on `'!['.repeat(n)` (measured 7.3 s at 40k and 26 s at 80k
 * before the fix). The bundled LINK transformer had the same shape. Both are
 * now bounded (see `IMAGE` / `SAFE_LINK` in markdown.ts).
 *
 * Known remaining limitation (deliberately not fixed; it is Lexical's own
 * `$runTextFormatTransformers`, not our code): repeated emphasis markers are
 * quadratic. `'*'.repeat(20_000)` settles at ~0.8 s, 40k at ~2.9 s and 100k
 * throws "Maximum call stack size exceeded" after ~12.5 s. The 200 000 char
 * `content_markdown` limit plus the try/catch in `resolveLexicalContent` (which
 * turns the throw into `validation_failed`) bound the impact.
 */
const BUDGET_MS = 2000;

function elapsed(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('markdown importer performance', () => {
  const boundedInputs: Array<[string, string]> = [
    ['repeated image markers', '!['.repeat(100_000)],
    ['repeated open brackets', '['.repeat(100_000)],
    ['repeated backticks', '`'.repeat(100_000)],
    ['repeated pipes', '|'.repeat(100_000)],
    ['repeated list markers', '- '.repeat(50_000)],
    ['repeated ordered list markers', '1. '.repeat(25_000)],
    ['repeated digits', '1'.repeat(100_000)],
    ['many link candidates', '[a]('.repeat(20_000)],
  ];

  it.each(boundedInputs)(
    'handles %s (~100k chars) under %dms',
    (_name, input) => {
      const duration = elapsed(() => markdownToLexical(input));
      expect(duration).toBeLessThan(BUDGET_MS);
    },
    60_000,
  );

  it('handles repeated emphasis markers at a representative size', () => {
    // Guard against regressions in the size we can still process quickly; the
    // 100k case is a known Lexical limitation documented above.
    const duration = elapsed(() => markdownToLexical('*'.repeat(20_000)));
    expect(duration).toBeLessThan(BUDGET_MS);
  });
});
