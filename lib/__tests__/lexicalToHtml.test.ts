import { describe, expect, it } from 'vitest';
import type { SerializedEditorState } from 'lexical';
import { lexicalToHtml } from '../lexicalToHtml';

function state(children: unknown[]): SerializedEditorState {
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

async function render(children: unknown[]): Promise<string> {
  return lexicalToHtml(state(children));
}

/**
 * Looks for an inline event-handler attribute (`onclick=`, `onerror=`, …)
 * inside a real tag. A literal ` onload=` in escaped text content is not an
 * attribute and must not be flagged.
 */
function hasEventHandlerAttribute(html: string): boolean {
  const tags = html.match(/<[a-zA-Z][^>]*>/g) ?? [];
  return tags.some((tag) => {
    // Attribute values are escaped, so quoted values never contain a raw `"`.
    // Stripping them leaves only structural markup: tag and attribute names.
    const structure = tag.replace(/"[^"]*"/g, '""');
    return / on[a-z]+\s*=/i.test(structure);
  });
}

const HOSTILE_VALUES = [
  '"><script>alert(1)</script>',
  '" onerror="alert(1)',
  "' onmouseover='alert(1)",
  'javascript:alert(1)',
  '</a><img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  '&<>"\'`=',
  'inherit',
  'h7',
  'dQw4w9WgXcQ" onload="alert(1)',
];

describe('lexicalToHtml heading tags', () => {
  it.each(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])(
    'renders %s as an element name',
    async (tag) => {
      const html = await render([{ type: 'heading', tag, children: [] }]);
      expect(html).toBe(`<${tag}></${tag}>`);
    },
  );

  it('collapses a hostile tag to h2 without interpolating it', async () => {
    const html = await render([
      {
        type: 'heading',
        tag: 'h1><img src=x onerror=alert(1)><h1',
        children: [],
      },
    ]);
    expect(html).toBe('<h2></h2>');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/ on[a-z]+=/i);
  });

  it.each([undefined, null, 42, {}, 'H1', 'script'])(
    'defaults a non-allowlisted tag %p to h2',
    async (tag) => {
      const html = await render([{ type: 'heading', tag, children: [] }]);
      expect(html).toBe('<h2></h2>');
    },
  );
});

describe('lexicalToHtml image dimensions', () => {
  const image = (width: unknown, height: unknown) => ({
    type: 'image',
    src: 'https://example.com/a.png',
    altText: 'a',
    width,
    height,
  });

  it('emits finite positive numbers', async () => {
    const html = await render([image(200, 120)]);
    expect(html).toContain('width="200"');
    expect(html).toContain('height="120"');
  });

  it('emits short numeric strings', async () => {
    const html = await render([image('300', '40')]);
    expect(html).toContain('width="300"');
    expect(html).toContain('height="40"');
  });

  it.each([
    'inherit',
    '1" onerror="alert(1)"',
    '12px',
    '',
    -1,
    0,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '123456',
    '1e3',
    {},
    [],
  ])('omits a non-conforming dimension %p', async (dimension) => {
    const html = await render([image(dimension, dimension)]);
    expect(html).not.toContain('width=');
    expect(html).not.toContain('height=');
    expect(html).not.toMatch(/ on[a-z]+=/i);
    expect(html).not.toContain('onerror');
  });
});

describe('lexicalToHtml youtube ids', () => {
  it('renders an 11-character id', async () => {
    const html = await render([{ type: 'youtube', id: 'dQw4w9WgXcQ' }]);
    expect(html).toContain(
      'src="https://www.youtube.com/embed/dQw4w9WgXcQ"',
    );
  });

  it('accepts the legacy videoID fallback', async () => {
    const html = await render([{ type: 'youtube', videoID: 'dQw4w9WgXcQ' }]);
    expect(html).toContain('youtube.com/embed/dQw4w9WgXcQ');
  });

  it.each([
    'short',
    'dQw4w9WgXcQx',
    'dQw4w9WgXcQ" onload="alert(1)',
    'dQw4w9WgXc',
    '../../evil',
    '',
  ])('renders nothing for an invalid id %p', async (id) => {
    const html = await render([{ type: 'youtube', id }]);
    expect(html).toBe('');
    expect(html).not.toContain('iframe');
    expect(html).not.toMatch(/ on[a-z]+=/i);
  });
});

describe('lexicalToHtml link handling', () => {
  it('escapes target and rel attributes', async () => {
    const html = await render([
      {
        type: 'link',
        url: 'https://example.com',
        target: '" onmouseover="alert(1)',
        rel: '"><script>',
        children: [{ type: 'text', text: 'x' }],
      },
    ]);
    expect(html).not.toContain('<script');
    expect(hasEventHandlerAttribute(html)).toBe(false);
    expect(html).toContain('&quot;');
  });

  it('drops the anchor for a dangerous scheme but keeps the text', async () => {
    const html = await render([
      {
        type: 'link',
        url: 'javascript:alert(1)',
        children: [{ type: 'text', text: 'click me' }],
      },
    ]);
    expect(html).toBe('click me');
    expect(html).not.toContain('href');
    expect(html).not.toContain('javascript:');
  });

  it('drops the image for a dangerous or missing src', async () => {
    for (const src of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', '', null, 42]) {
      const html = await render([{ type: 'image', src, altText: 'x' }]);
      expect(html).toBe('');
    }
  });

  it('never emits src for a rejected image', async () => {
    const html = await render([
      { type: 'image', src: 'data:image/png;base64,AAAA', altText: 'x' },
    ]);
    expect(html).not.toContain('data:');
  });
});

describe('lexicalToHtml is robust to wrong field types', () => {
  it.each([
    { type: 'text', text: 42 },
    { type: 'text', text: null },
    { type: 'text', text: { evil: true }, format: 'bold" onload=' },
    { type: 'paragraph', children: 'not-an-array' },
    { type: 'paragraph', children: [null, 42, 'x', { type: 'text', text: 'ok' }] },
    { type: 'link', url: 42, children: [{ type: 'text', text: 'x' }] },
    { type: 'image', src: 42, width: {}, height: [] },
    { type: 'list', listType: {}, children: [{ type: 'listitem' }] },
    { type: 'tablecell', headerState: 'yes', children: [] },
    { type: 42 },
    { type: 'paragraph', children: null },
  ])('does not throw for %p', async (node) => {
    await expect(render([node])).resolves.toBeTypeOf('string');
  });

  it('returns empty string for a malformed state instead of throwing', async () => {
    await expect(
      lexicalToHtml({} as SerializedEditorState),
    ).resolves.toBe('');
    await expect(
      lexicalToHtml({ root: { type: 'root', children: 'nope' } } as unknown as SerializedEditorState),
    ).resolves.toBe('');
    await expect(lexicalToHtml(null as unknown as SerializedEditorState)).resolves.toBe('');
  });
});

describe('lexicalToHtml hostile node shapes', () => {
  function nodeWith(type: string, field: string, value: unknown): unknown {
    const base: Record<string, unknown> = { type };
    if (type === 'text') {
      base.text = value;
    } else {
      base[field] = value;
    }
    if (type === 'heading' && field !== 'tag') base.tag = value;
    if (type === 'paragraph') base.children = [];
    if (type === 'text' && field !== 'text') base.text = value;
    return base;
  }

  const cases: Array<[string, unknown]> = [];
  for (const value of HOSTILE_VALUES) {
    for (const type of ['text', 'link', 'image', 'youtube', 'heading', 'paragraph']) {
      cases.push([`${type} with ${String(value).slice(0, 20)}`, nodeWith(type, 'url', value)]);
      cases.push([`${type} src hostile`, nodeWith(type, 'src', value)]);
      cases.push([`${type} alt hostile`, nodeWith(type, 'altText', value)]);
      cases.push([`${type} id hostile`, nodeWith(type, 'id', value)]);
      cases.push([`${type} target hostile`, nodeWith(type, 'target', value)]);
      cases.push([`${type} rel hostile`, nodeWith(type, 'rel', value)]);
      cases.push([`${type} tag hostile`, nodeWith(type, 'tag', value)]);
    }
  }

  it.each(cases)('%s produces safe HTML', async (_name, node) => {
    const html = await render([node]);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<iframe');
    expect(hasEventHandlerAttribute(html)).toBe(false);
    // No raw angle bracket can appear inside an attribute value: every `<` is
    // either a real tag start or escaped as &lt;.
    expect(html).not.toMatch(/="[^"]*[<>][^"]*"/);
  });

  it('handles nested unknown types without throwing', async () => {
    const nested = {
      type: 'unknown-outer',
      children: [
        {
          type: 'unknown-inner',
          children: [
            { type: 'text', text: '"><script>alert(1)</script>' },
            { type: 'paragraph', children: [{ type: 'weird', children: null }] },
          ],
        },
      ],
    };
    const html = await render([nested]);
    expect(html).not.toContain('<script');
    expect(html).toContain('alert(1)');
  });

  it('does not overflow the stack on deeply nested unknown nodes', async () => {
    let node: unknown = { type: 'text', text: 'deep' };
    for (let i = 0; i < 5000; i += 1) {
      node = { type: 'unknown', children: [node] };
    }
    await expect(render([node])).resolves.toBeTypeOf('string');
  });
});

describe('lexicalToHtml preserves legitimate editor content', () => {
  it('renders the expected structure', async () => {
    const html = await render([
      { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Title' }] },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'plain ' },
          { type: 'text', text: 'bold', format: 1 },
          { type: 'text', text: ' and ' },
          {
            type: 'link',
            url: 'https://example.com',
            target: '_blank',
            rel: 'noreferrer',
            children: [{ type: 'text', text: 'a link' }],
          },
        ],
      },
      { type: 'quote', children: [{ type: 'text', text: 'quoted' }] },
      { type: 'list', listType: 'number', children: [{ type: 'listitem', children: [] }] },
      {
        type: 'code',
        language: 'ts',
        children: [{ type: 'code-highlight', text: 'const x = 1;' }],
      },
      {
        type: 'table',
        children: [
          { type: 'tablerow', children: [{ type: 'tablecell', headerState: 1, children: [] }] },
        ],
      },
    ]);
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noreferrer">a link</a>');
    expect(html).toContain('<blockquote>quoted</blockquote>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<pre><code>const x = 1;</code></pre>');
    expect(html).toContain('<th>');
  });
});
