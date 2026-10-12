/**
 * Markdown fixtures shared by the M2 Markdown <-> Lexical tests.
 */

export const headingsMarkdown = `# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6`;

export const inlineFormattingMarkdown =
  'This has **bold**, *italic*, ~~strikethrough~~ and `inline code`.';

export const linksMarkdown = `An [absolute link](https://example.com/path?q=1) and a [relative link](/blog/post).

Also a [mailto link](mailto:hi@example.com) and a [fragment](#section).`;

export const unorderedListMarkdown = `- alpha
- beta
- gamma`;

export const orderedListMarkdown = `1. first
2. second
3. third`;

/** Lexical exports nested lists with 4 spaces per level. */
export const nestedListMarkdown = `- alpha
- beta
    - beta one
        - beta one A
    - beta two
- gamma`;

export const blockQuoteMarkdown = '> A quoted paragraph.';

export const fencedCodeMarkdown = '```ts\nconst answer = 42;\n```';

export const imageMarkdown = '![A cat](/images/cat.png)';

export const youtubeMarkdown = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

export const tableMarkdown = `| Name | Score |
| --- | --- |
| Ada | 10 |
| Linus | 9 |`;

export const notAYoutubeUrlMarkdown =
  'https://www.youtube.com/watch?v=tooshort';

export const emptyMarkdown = '';

/** A mixed post exercising many features at once. */
export const realisticPostMarkdown = `# Deploying PawPress

PawPress is a **Next.js** blog with _Lexical_ content. Read the [docs](/docs) first.

## Steps

1. Install dependencies
2. Run the dev server
    - with \`npm run dev\`
    - then open http://localhost:3000

> Tip: keep your token secret.

\`\`\`bash
npm run dev
\`\`\`

![dashboard](/images/dashboard.png)

https://youtu.be/dQw4w9WgXcQ

| Feature | Status |
| --- | --- |
| Markdown | done |
| Tables | done |`;

export const youtubeUrlForms: ReadonlyArray<{ input: string; id: string }> = [
  { input: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' },
  { input: 'https://youtube.com/watch?v=dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' },
  { input: 'http://m.youtube.com/watch?v=dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' },
  {
    input: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
    id: 'dQw4w9WgXcQ',
  },
  { input: 'https://youtu.be/dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' },
  { input: 'https://youtu.be/dQw4w9WgXcQ?t=42', id: 'dQw4w9WgXcQ' },
  { input: 'https://www.youtube.com/embed/dQw4w9WgXcQ', id: 'dQw4w9WgXcQ' },
  {
    input: 'https://www.youtube.com/embed/dQw4w9WgXcQ?start=42',
    id: 'dQw4w9WgXcQ',
  },
];
