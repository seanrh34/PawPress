import { SerializedEditorState, SerializedLexicalNode } from 'lexical';

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Apply text formatting based on node format
 */
function applyTextFormat(text: string, format?: number): string {
  if (!format) return text;
  
  let result = text;
  
  // Format flags from Lexical
  const IS_BOLD = 1;
  const IS_ITALIC = 1 << 1;
  const IS_STRIKETHROUGH = 1 << 2;
  const IS_UNDERLINE = 1 << 3;
  const IS_CODE = 1 << 4;
  const IS_SUBSCRIPT = 1 << 5;
  const IS_SUPERSCRIPT = 1 << 6;
  
  if (format & IS_BOLD) result = `<strong>${result}</strong>`;
  if (format & IS_ITALIC) result = `<em>${result}</em>`;
  if (format & IS_STRIKETHROUGH) result = `<s>${result}</s>`;
  if (format & IS_UNDERLINE) result = `<u>${result}</u>`;
  if (format & IS_CODE) result = `<code>${result}</code>`;
  if (format & IS_SUBSCRIPT) result = `<sub>${result}</sub>`;
  if (format & IS_SUPERSCRIPT) result = `<sup>${result}</sup>`;
  
  return result;
}

/**
 * Convert a single Lexical node to HTML
 */
function nodeToHtml(node: any): string {
  const type = node.type;
  
  // Text node
  if (type === 'text') {
    const text = escapeHtml(node.text || '');
    return applyTextFormat(text, node.format);
  }
  
  // Line break
  if (type === 'linebreak') {
    return '<br>';
  }
  
  // Paragraph
  if (type === 'paragraph') {
    const children = node.children?.map(nodeToHtml).join('') || '';
    return `<p>${children}</p>`;
  }
  
  // Headings
  if (type === 'heading') {
    const tag = node.tag || 'h1';
    const children = node.children?.map(nodeToHtml).join('') || '';
    return `<${tag}>${children}</${tag}>`;
  }
  
  // Quote
  if (type === 'quote') {
    const children = node.children?.map(nodeToHtml).join('') || '';
    return `<blockquote>${children}</blockquote>`;
  }
  
  // List
  if (type === 'list') {
    const tag = node.listType === 'number' ? 'ol' : 'ul';
    const children = node.children?.map(nodeToHtml).join('') || '';
    return `<${tag}>${children}</${tag}>`;
  }
  
  // List item
  if (type === 'listitem') {
    const children = node.children?.map(nodeToHtml).join('') || '';
    return `<li>${children}</li>`;
  }
  
  // Code block
  if (type === 'code') {
    const children = node.children?.map((child: any) => {
      if (child.type === 'text') {
        return escapeHtml(child.text || '');
      }
      return nodeToHtml(child);
    }).join('') || '';
    return `<pre><code>${children}</code></pre>`;
  }
  
  // Link
  if (type === 'link') {
    const href = escapeHtml(node.url || '');
    const children = node.children?.map(nodeToHtml).join('') || '';
    const target = node.target ? ` target="${escapeHtml(node.target)}"` : '';
    const rel = node.rel ? ` rel="${escapeHtml(node.rel)}"` : '';
    return `<a href="${href}"${target}${rel}>${children}</a>`;
  }
  
  // Image
  if (type === 'image') {
    const src = escapeHtml(node.src || '');
    const alt = escapeHtml(node.altText || '');
    const width = node.width ? ` width="${node.width}"` : '';
    const height = node.height ? ` height="${node.height}"` : '';
    return `<img src="${src}" alt="${alt}"${width}${height} />`;
  }
  
  // YouTube embed
  if (type === 'youtube') {
    const videoId = escapeHtml(node.videoID || '');
    return `<div class="youtube-embed"><iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  
  // Table
  if (type === 'table') {
    const children = node.children?.map(nodeToHtml).join('') || '';
    return `<table>${children}</table>`;
  }
  
  if (type === 'tablerow') {
    const children = node.children?.map(nodeToHtml).join('') || '';
    return `<tr>${children}</tr>`;
  }
  
  if (type === 'tablecell') {
    const tag = node.headerState ? 'th' : 'td';
    const children = node.children?.map(nodeToHtml).join('') || '';
    return `<${tag}>${children}</${tag}>`;
  }
  
  // Unknown node type - try to render children
  if (node.children) {
    return node.children.map(nodeToHtml).join('');
  }
  
  return '';
}

/**
 * Convert Lexical SerializedEditorState to HTML string
 * This is a pure JSON-to-HTML converter that doesn't require DOM libraries
 */
export async function lexicalToHtml(editorState: SerializedEditorState): Promise<string> {
  try {
    console.log('Starting HTML conversion...');
    
    const root = editorState.root;
    if (!root || !root.children) {
      console.log('Empty editor state');
      return '';
    }
    
    const html = root.children.map(nodeToHtml).join('');
    
    console.log('HTML generated, length:', html.length);
    return html;
  } catch (error) {
    console.error('Failed to convert Lexical to HTML:', error);
    console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
    throw error;
  }
}
