import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors';

const holder = vi.hoisted(() => ({
  convert: undefined as undefined | ((markdown: string) => unknown),
}));

vi.mock('../markdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../markdown')>();
  return {
    ...actual,
    markdownToLexical: (markdown: string) => {
      if (holder.convert) {
        return holder.convert(markdown) as never;
      }
      return actual.markdownToLexical(markdown);
    },
  };
});

import { resolveLexicalContent } from '../v1';

afterEach(() => {
  holder.convert = undefined;
});

describe('resolveLexicalContent conversion safety net', () => {
  it('maps a RangeError from markdown conversion to validation_failed', () => {
    holder.convert = () => {
      throw new RangeError('Maximum call stack size exceeded');
    };

    const error = (() => {
      try {
        resolveLexicalContent({ content_markdown: 'anything' });
        return null;
      } catch (caught) {
        return caught as ApiError;
      }
    })();

    expect(error).toBeInstanceOf(ApiError);
    expect(error?.code).toBe('validation_failed');
    expect(
      (error?.details as { fields: Record<string, string[]> }).fields
        .content_markdown.length,
    ).toBeGreaterThan(0);
  });

  it('maps other conversion errors to validation_failed without logging content', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    holder.convert = () => {
      throw new Error('boom secret-body');
    };

    const error = (() => {
      try {
        resolveLexicalContent({ content_markdown: 'secret-body' });
        return null;
      } catch (caught) {
        return caught as ApiError;
      }
    })();

    expect(error?.code).toBe('validation_failed');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
