import editorTheme from "@/lib/EditorTheme";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import ToolbarPlugin from "@/app/admin/lexical/plugins/ToolbarPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TRANSFORMERS } from "@lexical/markdown";
import { EditorState, SerializedEditorState } from "lexical";
import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import ListMaxIndentLevelPlugin from "@/app/admin/lexical/plugins/ListMaxIndentLevelPlugin";
import CodeHighlightPlugin from "@/app/admin/lexical/plugins/CodeHighlightPlugin";
import { ImageNode } from "@/app/admin/lexical/nodes/ImageNode";
import { YoutubeNode } from "@/app/admin/lexical/nodes/YoutubeNode";

interface EditorProps {
  onChange?: (editorState: SerializedEditorState) => void;
  initialState?: SerializedEditorState | null;
}

// Plugin to set initial editor state
function InitialStatePlugin({ initialState }: { initialState: SerializedEditorState | null }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (initialState) {
      // Use queueMicrotask to defer state update and avoid flushSync warning
      queueMicrotask(() => {
        const editorState = editor.parseEditorState(initialState);
        editor.setEditorState(editorState);
      });
    }
  }, []); // Only run once on mount

  return null;
}

function Placeholder() {
  return <div className="editor-placeholder">Enter some rich text...</div>;
}

const editorConfig = {
  namespace: 'PostEditor',
  // The editor theme
  theme: editorTheme,
  // Handling of errors during update
  onError(error: Error) {
    throw error;
  },
  // Any custom nodes go here
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
  ]
};

export default function Editor({ onChange, initialState }: EditorProps) {
  const handleChange = (editorState: EditorState) => {
    if (onChange) {
      const json = editorState.toJSON();
      onChange(json);
    }
  };

  return (
    <LexicalComposer initialConfig={editorConfig}>
      <div className="editor-container">
        <ToolbarPlugin />
        <div className="editor-inner">
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            placeholder={<Placeholder />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <AutoFocusPlugin />
          <CodeHighlightPlugin />
          <ListPlugin />
          <LinkPlugin />
          <ListMaxIndentLevelPlugin maxDepth={7} />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <OnChangePlugin onChange={handleChange} />
          {initialState && <InitialStatePlugin initialState={initialState} />}
        </div>
      </div>
    </LexicalComposer>
  );
}
