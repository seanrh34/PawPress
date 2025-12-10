import { createHeadlessEditor } from '@lexical/headless';
import { $generateHtmlFromNodes } from '@lexical/html';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { SerializedEditorState } from 'lexical';

// Global flag to track if jsdom has been initialized
let isJsdomInitialized = false;

/**
 * Initialize jsdom for server-side DOM
 */
async function initializeJsdom() {
  if (isJsdomInitialized) return;
  
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM();
  (global as any).document = dom.window.document;
  (global as any).window = dom.window;
  isJsdomInitialized = true;
}

/**
 * Convert Lexical SerializedEditorState to HTML string
 * This is used server-side to generate SEO-friendly HTML content
 */
export async function lexicalToHtml(editorState: SerializedEditorState): Promise<string> {
  try {
    // Initialize jsdom if not already done
    await initializeJsdom();
    
    // Create a headless editor (no DOM required)
    const editor = createHeadlessEditor({
      namespace: 'HeadlessEditor',
      nodes: [
        HeadingNode,
        ListNode,
        ListItemNode,
        QuoteNode,
        CodeNode,
        CodeHighlightNode,
        TableNode,
        TableCellNode,
        TableRowNode,
        LinkNode,
        // Note: Custom nodes like ImageNode and YoutubeNode excluded - they may have client-side dependencies
      ],
      onError: (error: Error) => {
        console.error('Lexical error during HTML conversion:', error);
        throw error;
      },
    });

    let html = '';

    // Parse the editor state and generate HTML
    editor.setEditorState(editor.parseEditorState(editorState));
    editor.getEditorState().read(() => {
      html = $generateHtmlFromNodes(editor);
    });

    console.log(html);
    return html;
  } catch (error) {
    console.error('Failed to convert Lexical to HTML:', error);
    throw error;
  }
}
