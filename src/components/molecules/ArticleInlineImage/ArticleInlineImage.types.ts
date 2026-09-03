export interface ArticleInlineImageProps {
  /** Markdown image destination, passed through raw by PostText's urlTransform */
  src?: string;
  alt?: string;
  /** The article post's full attachment URI list (`attachment:{n}` slots) */
  attachments: string[];
  /** The article author's pubky — attachment refs must resolve to files they own */
  authorId: string;
  /** Composite post id — local files store key for same-session previews */
  postId: string;
}

export type ResolvedArticleImageSrc =
  /** Managed attachment reference resolved through `attachments[n]` */
  | { kind: 'attachment'; url: string; index: number }
  /** Direct homeserver file URI (any owner), resolved to the CDN */
  | { kind: 'pubky'; url: string }
  /** External https image, rendered with tracking mitigations */
  | { kind: 'external'; url: string }
  /** Anything else — rendered as an unavailable placeholder, no network request */
  | { kind: 'invalid' };
