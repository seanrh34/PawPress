'use client';

import editorTheme from "@/lib/EditorTheme";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { SerializedEditorState } from "lexical";

import CodeHighlightPlugin from "@/app/admin/lexical/plugins/CodeHighlightPlugin";
import { ImageNode } from "@/app/admin/lexical/nodes/ImageNode";
import { YoutubeNode } from "@/app/admin/lexical/nodes/YoutubeNode";

interface PostViewerProps {
  content: SerializedEditorState;
}

export default function PostViewer({ content }: PostViewerProps) {
  const editorConfig = {
    namespace: 'PostViewer',
    editable: false, // Read-only mode
    theme: editorTheme,
    onError(error: Error) {
      console.error('Lexical error:', error);
    },
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
    editorState: JSON.stringify(content), // Load the initial state
  };

  return (
    <LexicalComposer initialConfig={editorConfig}>
      <div className="editor-container">
        <div className="editor-inner">
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            placeholder={null}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <CodeHighlightPlugin />
          <ListPlugin />
          <LinkPlugin />
        </div>
      </div>
    </LexicalComposer>
  );
}
