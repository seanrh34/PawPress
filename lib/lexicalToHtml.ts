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

/**
 * Convert Lexical SerializedEditorState to HTML string
 * This is used server-side to generate SEO-friendly HTML content
 */
export function lexicalToHtml(editorState: SerializedEditorState): string {
  // Create a headless editor (no DOM required)
  const editor = createHeadlessEditor({
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
      YoutubeNode,
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

  return html;
}
