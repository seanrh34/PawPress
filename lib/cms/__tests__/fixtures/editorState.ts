/**
 * Hand-written fixture matching what the web editor (`components/Editor.tsx`)
 * serializes. It intentionally includes node shapes the Markdown importer does
 * not produce directly, so `lexicalToMarkdown` is exercised against real editor
 * output: a heading, a paragraph with bold/italic/link, a code block whose
 * children are `code-highlight` nodes, and an image carrying width/height.
 */

import type { SerializedEditorState } from 'lexical';

export const editorPostState = {
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'Hello world',
            type: 'text',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'heading',
        version: 1,
        tag: 'h2',
      },
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'A paragraph with ',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 1,
            mode: 'normal',
            style: '',
            text: 'bold',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ' and a ',
            type: 'text',
            version: 1,
          },
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'link',
                type: 'text',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'link',
            version: 3,
            rel: 'noreferrer',
            target: null,
            title: null,
            url: 'https://example.com',
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: '.',
            type: 'text',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
        textFormat: 0,
        textStyle: '',
      },
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'const',
            type: 'code-highlight',
            version: 1,
            highlightType: 'keyword',
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ' answer = ',
            type: 'code-highlight',
            version: 1,
            highlightType: null,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: '42',
            type: 'code-highlight',
            version: 1,
            highlightType: 'number',
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ';',
            type: 'code-highlight',
            version: 1,
            highlightType: null,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'code',
        version: 1,
        language: 'ts',
      },
      {
        children: [
          {
            altText: 'A cat',
            height: 120,
            width: 200,
            maxWidth: 400,
            src: 'https://example.com/cat.png',
            type: 'image',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
        textFormat: 0,
        textStyle: '',
      },
      {
        children: [
          {
            id: 'dQw4w9WgXcQ',
            type: 'youtube',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
        textFormat: 0,
        textStyle: '',
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
} as unknown as SerializedEditorState;

export const editorPostMarkdown = `## Hello world

A paragraph with **bold** and a [link](https://example.com).

\`\`\`ts
const answer = 42;
\`\`\`

![A cat](https://example.com/cat.png)

https://www.youtube.com/watch?v=dQw4w9WgXcQ`;

/**
 * Synthetic shape of real web-editor output when the link toolbar is left on
 * its default: the `url` is the scheme-only placeholder "https://". It links
 * nowhere but must not be rejected by the v1 content checks.
 */
export const editorPlaceholderLinkState = {
  root: {
    children: [
      {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'the docs',
                type: 'text',
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'link',
            version: 1,
            rel: null,
            target: null,
            title: null,
            url: 'https://',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
        textFormat: 0,
        textStyle: '',
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
} as unknown as SerializedEditorState;

export const editorPlaceholderLinkMarkdown = '[the docs](https://)';
