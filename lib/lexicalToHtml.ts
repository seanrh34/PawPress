import { createHeadlessEditor } from '@lexical/headless';
import { $generateHtmlFromNodes } from '@lexical/html';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { SerializedEditorState } from 'lexical';
import { ImageNode } from '@/app/admin/lexical/nodes/ImageNode';
import { YoutubeNode } from '@/app/admin/lexical/nodes/YoutubeNode';

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
    console.log('Starting HTML conversion...');
    
    // Initialize jsdom if not already done
    await initializeJsdom();
    console.log('jsdom initialized');
    
    // Create a headless editor
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
        ImageNode,
        YoutubeNode
      ],
      onError: (error: Error) => {
        console.error('Lexical error during HTML conversion:', error);
        throw error;
      },
    });

    console.log('Editor created');
    
    let html = '';

    // Parse the editor state and generate HTML
    editor.setEditorState(editor.parseEditorState(editorState));
    editor.getEditorState().read(() => {
      html = $generateHtmlFromNodes(editor);
    });

    console.log('HTML generated, length:', html.length);
    return html;
  } catch (error) {
    console.error('Failed to convert Lexical to HTML:', error);
    console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
    throw error;
  }
}
