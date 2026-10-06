import {
  DecoratorNode,
  type DOMConversionMap,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';

/**
 * Server-safe copies of the web editor's decorator nodes.
 *
 * The web editor renders images and YouTube embeds with React DecoratorNodes
 * (`app/admin/lexical/nodes/ImageNode.tsx` / `YoutubeNode.tsx`). Those files
 * pull in the JSX runtime and expose DOM rendering, which we do not want on the
 * Node server. These classes replicate `getType()`, `importJSON()` and
 * `exportJSON()` byte-for-byte so serialized JSON produced here is loaded by the
 * web editor's own nodes unchanged.
 *
 * Keep the JSON contract in sync with the editor classes:
 * - image:  { type: "image", version: 1, src, altText, maxWidth: 400, width: "inherit", height: "inherit" }
 * - youtube:{ type: "youtube", version: 1, id }
 *
 * None of the DOM/render methods are reachable in a headless editor; they throw
 * rather than silently doing nothing.
 */

export type SerializedServerImageNode = Spread<
  {
    altText: string;
    height?: 'inherit' | number;
    maxWidth: number;
    src: string;
    width?: 'inherit' | number;
  },
  SerializedLexicalNode
>;

export function $createImageNode({
  altText,
  height,
  maxWidth = 400,
  src,
  width,
}: {
  altText: string;
  height?: number;
  maxWidth?: number;
  src: string;
  width?: number;
}): ServerImageNode {
  return new ServerImageNode({ altText, height, maxWidth, src, width });
}

export class ServerImageNode extends DecoratorNode<null> {
  __src: string;
  __altText: string;
  __height: 'inherit' | number;
  __width: 'inherit' | number;
  __maxWidth: number;

  constructor({
    src,
    altText,
    maxWidth,
    width,
    height,
    key,
  }: {
    src: string;
    altText: string;
    maxWidth: number;
    width?: 'inherit' | number;
    height?: 'inherit' | number;
    key?: NodeKey;
  }) {
    super(key);
    this.__altText = altText;
    this.__width = width || 'inherit';
    this.__height = height || 'inherit';
    this.__maxWidth = maxWidth;
    this.__src = src;
  }

  static getType(): string {
    return 'image';
  }

  static clone(node: ServerImageNode): ServerImageNode {
    return new ServerImageNode({
      altText: node.__altText,
      src: node.__src,
      height: node.__height,
      width: node.__width,
      maxWidth: node.__maxWidth,
      key: node.__key,
    });
  }

  static importJSON(serializedNode: SerializedServerImageNode): ServerImageNode {
    const { altText, height, width, maxWidth, src } = serializedNode;
    return new ServerImageNode({
      altText,
      height: height === 'inherit' ? 'inherit' : height,
      maxWidth,
      src,
      width: width === 'inherit' ? 'inherit' : width,
    });
  }

  static importDOM(): DOMConversionMap | null {
    return null;
  }

  exportJSON(): SerializedServerImageNode {
    return {
      altText: this.__altText,
      height: this.__height === 'inherit' ? 'inherit' : this.__height,
      width: this.__width === 'inherit' ? 'inherit' : this.__width,
      maxWidth: this.__maxWidth,
      src: this.__src,
      type: 'image',
      version: 1,
    };
  }

  decorate(): null {
    return null;
  }

  createDOM(): HTMLElement {
    throw new Error('ServerImageNode.createDOM is not supported in headless mode');
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    throw new Error('ServerImageNode.exportDOM is not supported in headless mode');
  }
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ServerImageNode {
  return node instanceof ServerImageNode;
}

export type SerializedServerYoutubeNode = Spread<
  {
    id: string;
  },
  SerializedLexicalNode
>;

export function $createYoutubeNode({ id }: { id: string }): ServerYoutubeNode {
  return new ServerYoutubeNode({ id });
}

export class ServerYoutubeNode extends DecoratorNode<null> {
  __id: string;

  constructor({ id, key }: { id: string; key?: NodeKey }) {
    super(key);
    this.__id = id;
  }

  static getType(): string {
    return 'youtube';
  }

  static clone(node: ServerYoutubeNode): ServerYoutubeNode {
    return new ServerYoutubeNode({
      id: node.__id,
      key: node.__key,
    });
  }

  static importJSON(
    serializedNode: SerializedServerYoutubeNode,
  ): ServerYoutubeNode {
    const { id } = serializedNode;
    return new ServerYoutubeNode({ id });
  }

  static importDOM(): DOMConversionMap | null {
    return null;
  }

  exportJSON(): SerializedServerYoutubeNode {
    return {
      id: this.__id,
      type: 'youtube',
      version: 1,
    };
  }

  decorate(): null {
    return null;
  }

  createDOM(): HTMLElement {
    throw new Error(
      'ServerYoutubeNode.createDOM is not supported in headless mode',
    );
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    throw new Error(
      'ServerYoutubeNode.exportDOM is not supported in headless mode',
    );
  }
}

export function $isYoutubeNode(
  node: LexicalNode | null | undefined,
): node is ServerYoutubeNode {
  return node instanceof ServerYoutubeNode;
}
