import { describe, expect, it } from 'vitest';
import { parseFrontMatter, serializeFrontMatter } from '../src/frontmatter';

describe('front matter', () => {
  it('round trips data and body', () => {
    const data = {
      id: '00000000-0000-0000-0000-000000000000',
      title: 'Hello: world',
      slug: 'hello-world',
      category: 'news',
      excerpt: '',
      featured_image: null,
      status: 'draft',
      updated_at: '2026-10-06T12:00:00.000Z',
    };
    const body = '# Heading\n\nSome *markdown*.\n';
    const text = serializeFrontMatter(data, body);
    const parsed = parseFrontMatter(text);
    expect(parsed.hasFrontMatter).toBe(true);
    expect(parsed.data).toEqual(data);
    expect(parsed.body).toBe(body);
  });

  it('handles input without front matter', () => {
    const parsed = parseFrontMatter('# Just a body\n\ntext');
    expect(parsed.hasFrontMatter).toBe(false);
    expect(parsed.data).toEqual({});
    expect(parsed.body).toBe('# Just a body\n\ntext');
  });

  it('normalises CRLF line endings', () => {
    const parsed = parseFrontMatter('---\r\ntitle: X\r\n---\r\nbody line\r\n');
    expect(parsed.data).toEqual({ title: 'X' });
    expect(parsed.body).toBe('body line\n');
  });

  it('keeps --- inside the body', () => {
    const parsed = parseFrontMatter('---\ntitle: X\n---\nbefore\n---\nafter\n');
    expect(parsed.data).toEqual({ title: 'X' });
    expect(parsed.body).toBe('before\n---\nafter\n');
  });

  it('treats an unterminated block as plain body', () => {
    const parsed = parseFrontMatter('---\ntitle: X\nno close');
    expect(parsed.hasFrontMatter).toBe(false);
  });
});
