import { describe, expect, it } from 'vitest';
import type { SerializedEditorState } from 'lexical';
import {
  findUnsafeUrls,
  isAllowedImageUrl,
  isAllowedLinkUrl,
  isValidLexicalState,
} from '../contentSafety';

function makeState(children: unknown[]): SerializedEditorState {
  return {
    root: {
      children,
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  } as unknown as SerializedEditorState;
}

function paragraph(children: unknown[]): unknown {
  return {
    children,
    direction: null,
    format: '',
    indent: 0,
    type: 'paragraph',
    version: 1,
    textFormat: 0,
    textStyle: '',
  };
}

function imageNode(src: string): unknown {
  return { altText: '', height: 'inherit', width: 'inherit', maxWidth: 400, src, type: 'image', version: 1 };
}

function linkNode(url: string): unknown {
  return {
    children: [
      { detail: 0, format: 0, mode: 'normal', style: '', text: 'x', type: 'text', version: 1 },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'link',
    version: 3,
    rel: null,
    target: null,
    title: null,
    url,
  };
}

describe('isAllowedImageUrl', () => {
  it.each([
    '/images/a.png',
    'https://example.com/a.png',
    'http://example.com/a.png',
    '  https://example.com/a.png  ',
  ])('allows %s', (url) => {
    expect(isAllowedImageUrl(url)).toBe(true);
  });

  it.each([
    'data:image/png;base64,AAAA',
    '//example.com/a.png',
    'ftp://example.com/a.png',
    'images/a.png',
    '#frag',
    '',
    '/\\evil.com',
    '/a b.png',
    '/a\tb.png',
    'https://exa mple.com',
  ])('rejects %s', (url) => {
    expect(isAllowedImageUrl(url)).toBe(false);
  });
});

describe('isAllowedLinkUrl', () => {
  it.each([
    'https://example.com',
    'HTTP://example.com',
    'mailto:hi@example.com',
    'MAILTO:hi@example.com',
    '/blog/post',
    '/blog/post?q=1',
    '#section',
    'https://',
    'http://',
    'HTTP://',
    '  https://  ',
  ])('allows %s', (url) => {
    expect(isAllowedLinkUrl(url)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' JavaScript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>',
    'vbscript:msgbox(1)',
    '//evil.example.com',
    'ftp://example.com',
    'relative/path',
    '',
    '#',
    '/\\evil.com',
    '/a\\b',
    '/a b.png',
    'https://exa mple.com',
    'mailto:a b@example.com',
    'https:',
    'http:/',
    'https:///',
    'https:// http://',
  ])('rejects %s', (url) => {
    expect(isAllowedLinkUrl(url)).toBe(false);
  });
});

describe('findUnsafeUrls', () => {
  it('reports unsafe image and link URLs with paths and reasons', () => {
    const state = makeState([
      paragraph([
        imageNode('data:image/png;base64,AAAA'),
        linkNode(' JavaScript:alert(1)'),
        linkNode('https://example.com/ok'),
        imageNode('/images/ok.png'),
      ]),
    ]);
    const unsafe = findUnsafeUrls(state);
    expect(unsafe).toHaveLength(2);
    expect(unsafe[0]).toMatchObject({
      path: 'root.children[0].children[0]',
      nodeType: 'image',
      url: 'data:image/png;base64,AAAA',
    });
    expect(unsafe[0].reason).toContain('upload images with POST /api/v1/media first');
    expect(unsafe[1]).toMatchObject({
      path: 'root.children[0].children[1]',
      nodeType: 'link',
      url: ' JavaScript:alert(1)',
    });
    expect(unsafe[1].reason).toContain('javascript: link URLs are not allowed');
  });

  it('rejects backslash site-relative URLs that browsers treat as protocol-relative', () => {
    const state = makeState([
      paragraph([imageNode('/\\evil.com/a.png'), linkNode('/\\evil.com')]),
    ]);
    const unsafe = findUnsafeUrls(state);
    expect(unsafe).toHaveLength(2);
    expect(unsafe[0].nodeType).toBe('image');
    expect(unsafe[0].reason).toContain('backslash');
    expect(unsafe[1].nodeType).toBe('link');
    expect(unsafe[1].reason).toContain('backslash');
  });

  it('returns nothing for a safe state', () => {
    const state = makeState([
      paragraph([linkNode('https://example.com'), imageNode('/a.png')]),
    ]);
    expect(findUnsafeUrls(state)).toEqual([]);
  });

  it('walks nested structures', () => {
    const state = makeState([
      {
        children: [
          {
            children: [imageNode('javascript:alert(1)')],
            type: 'tablecell',
            version: 1,
          },
        ],
        type: 'table',
        version: 1,
      },
    ]);
    const unsafe = findUnsafeUrls(state);
    expect(unsafe).toHaveLength(1);
    expect(unsafe[0].nodeType).toBe('image');
    expect(unsafe[0].path).toBe(
      'root.children[0].children[0].children[0]',
    );
  });

  it('returns nothing for an invalid state', () => {
    expect(findUnsafeUrls({} as SerializedEditorState)).toEqual([]);
    expect(
      findUnsafeUrls({ root: { type: 'root' } } as unknown as SerializedEditorState),
    ).toEqual([]);
  });
});

describe('isValidLexicalState', () => {
  it('accepts a root with a children array', () => {
    expect(isValidLexicalState(makeState([]))).toBe(true);
  });

  it.each([
    null,
    undefined,
    42,
    'nope',
    {},
    { root: null },
    { root: {} },
    { root: { type: 'root' } },
    { root: { type: 'root', children: 'no' } },
  ])('rejects %s', (value) => {
    expect(isValidLexicalState(value)).toBe(false);
  });
});
