import { $wrapNodeInElement } from '@lexical/utils';
import {
  $createParagraphNode,
  $insertNodes,
  $isRootOrShadowRoot,
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import type { JSX } from 'react';
import {
  inferMediaKindFromUrl,
  type InlineNonImageMediaKind,
  isInlineNonImageMediaKind,
} from '@/libs/file/inlineMediaKind';
import { InlineMediaEditor } from './InlineMediaEditor';

export type SerializedInlineMediaNode = Spread<
  { src: string; altText: string; title: string; mediaKind: InlineNonImageMediaKind },
  SerializedLexicalNode
>;

export interface CreateInlineMediaNodeParams {
  src: string;
  altText?: string;
  title?: string;
  mediaKind: InlineNonImageMediaKind;
  key?: NodeKey;
}

/**
 * A video, audio or PDF embedded in an article body. Mirrors MDXEditor's `ImageNode` (an inline
 * decorator in a `span`) because the two share one markdown form: the node is imported from and
 * exported to a plain mdast `image`, so `![alt](src)` is byte-identical whatever the media kind,
 * and `serializeArticleBody` keeps mapping every one of them to an `attachment:{n}` slot.
 */
export class InlineMediaNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;
  __title: string;
  __mediaKind: InlineNonImageMediaKind;

  static getType(): string {
    return 'inline-media';
  }

  static clone(node: InlineMediaNode): InlineMediaNode {
    return new InlineMediaNode(node.__src, node.__altText, node.__title, node.__mediaKind, node.__key);
  }

  static importJSON(serializedNode: SerializedInlineMediaNode): InlineMediaNode {
    const { src, altText, title, mediaKind } = serializedNode;
    // Pasted editor JSON is not this editor's: an unknown kind falls back to what the source says,
    // then to the one rendering that never loads the source
    return $createInlineMediaNode({
      src,
      altText,
      title,
      mediaKind: isInlineNonImageMediaKind(mediaKind) ? mediaKind : (inferMediaKindFromUrl(src) ?? 'pdf'),
    });
  }

  constructor(src: string, altText: string, title: string, mediaKind: InlineNonImageMediaKind, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__title = title;
    this.__mediaKind = mediaKind;
  }

  afterCloneFrom(prevNode: this): void {
    super.afterCloneFrom(prevNode);
    this.__src = prevNode.__src;
    this.__altText = prevNode.__altText;
    this.__title = prevNode.__title;
    this.__mediaKind = prevNode.__mediaKind;
  }

  exportJSON(): SerializedInlineMediaNode {
    return {
      type: 'inline-media',
      version: 1,
      src: this.getSrc(),
      altText: this.getAltText(),
      title: this.getTitle(),
      mediaKind: this.getMediaKind(),
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    // The image theme class gives both node kinds the same spacing in the editor
    const className = config.theme.image;
    if (typeof className === 'string') span.className = className;
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getSrc(): string {
    return this.__src;
  }

  getAltText(): string {
    return this.__altText;
  }

  getTitle(): string {
    return this.__title;
  }

  getMediaKind(): InlineNonImageMediaKind {
    return this.__mediaKind;
  }

  setSrc(src: string): void {
    this.getWritable().__src = src;
  }

  setAltText(altText: string): void {
    this.getWritable().__altText = altText;
  }

  setTitle(title: string): void {
    this.getWritable().__title = title;
  }

  decorate(): JSX.Element {
    return (
      <InlineMediaEditor
        src={this.getSrc()}
        altText={this.getAltText()}
        title={this.getTitle()}
        mediaKind={this.getMediaKind()}
        nodeKey={this.getKey()}
      />
    );
  }
}

export function $createInlineMediaNode({ src, altText, title, mediaKind, key }: CreateInlineMediaNodeParams) {
  return new InlineMediaNode(src, altText ?? '', title ?? '', mediaKind, key);
}

export function $isInlineMediaNode(node: LexicalNode | null | undefined): node is InlineMediaNode {
  return node instanceof InlineMediaNode;
}

/** Inserts at the selection the way `imagePlugin` inserts an image, wrapping a root-level node in a paragraph. */
export function $insertInlineMediaNode(params: CreateInlineMediaNodeParams): InlineMediaNode {
  const node = $createInlineMediaNode(params);
  $insertNodes([node]);
  if ($isRootOrShadowRoot(node.getParentOrThrow())) {
    $wrapNodeInElement(node, $createParagraphNode).selectEnd();
  }
  return node;
}
