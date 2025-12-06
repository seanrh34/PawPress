import {
  DecoratorNode,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";

export type SerializedImageNode = Spread<
  {
    altText: string;
    height?: "inherit" | number;
    maxWidth: number;
    src: string;
    width?: "inherit" | number;
  },
  SerializedLexicalNode
>;

export const $createImageNode = ({
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
}) => {
  return new ImageNode({ altText, height, maxWidth, src, width });
};

const convertImageElement = (domNode: Node): DOMConversionOutput | null => {
  if (domNode instanceof HTMLImageElement) {
    const { src, alt } = domNode;
    const node = $createImageNode({ src, altText: alt });
    return { node };
  }
  return null;
};

export class ImageNode extends DecoratorNode<React.JSX.Element> {
    __src: string;
    __altText: string;
    __height: "inherit" | number;
    __width: "inherit" | number;
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
        width?: "inherit" | number;
        height?: "inherit" | number;
        key?: NodeKey;
    }) {
        super(key);
        this.__altText = altText;
        this.__width = width || "inherit";
        this.__height = height || "inherit";
        this.__maxWidth = maxWidth;
        this.__src = src;
    }

    static getType(): string {
        return "image";
    }

    static clone(_node: ImageNode): ImageNode {
        return new ImageNode({
        altText: _node.__altText,
        src: _node.__src,
        height: _node.__height,
        width: _node.__width,
        maxWidth: _node.__maxWidth,
        key: _node.__key,
        });
    }

    static importJSON(serializedNode: SerializedImageNode): ImageNode {
        const { altText, height, width, maxWidth, src } = serializedNode;
        return new ImageNode({
        altText,
        height: height === "inherit" ? "inherit" : height,
        maxWidth,
        src,
        width: width === "inherit" ? "inherit" : width,
        });
    }

    exportJSON(): SerializedImageNode {
        return {
        altText: this.__altText,
        height: this.__height === "inherit" ? "inherit" : this.__height,
        width: this.__width === "inherit" ? "inherit" : this.__width,
        maxWidth: this.__maxWidth,
        src: this.__src,
        type: "image",
        version: 1,
        };
    }

    decorate(): React.JSX.Element {
        return (
        <img
            src={this.__src}
            alt={this.__altText}
            style={{
            width: this.__width,
            height: this.__height,
            maxWidth: this.__maxWidth,
            }}
        />
        );
    }

    createDOM(): HTMLElement {
        const span = document.createElement("span");
        return span;
    }

    updateDOM(): false {
        return false;
    }

    exportDOM(): DOMExportOutput {
        const image = document.createElement("img");
        image.setAttribute("src", this.__src);
        image.setAttribute("alt", this.__altText);

        return { element: image };
    }

    static importDOM(): DOMConversionMap | null {
        return {
        img: (node: Node) => {
            return { conversion: convertImageElement, priority: 0 };
        },
        };
    }
}