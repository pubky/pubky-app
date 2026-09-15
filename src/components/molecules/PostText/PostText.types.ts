import { AnchorHTMLAttributes, ButtonHTMLAttributes, ClassAttributes } from 'react';
import type React from 'react';
import { ExtraProps } from 'react-markdown';

export interface PostTextProps {
  content: string;
  isArticle?: boolean;
  /**
   * Full article body on the article page: renders with the same `prose` typography
   * as the article editor (paragraph/list/heading margins, outside list markers)
   * instead of the compact pre-line post styling. Callers pass it together with
   * `isArticle`; previews (feed cards) leave it off.
   */
  fullArticle?: boolean;
  /**
   * Enables inline article images (article detail page only). Without it,
   * article image nodes are stripped before rendering — feed previews and
   * embedded article cards never show body images.
   */
  articleImages?: {
    /** The post's full attachment URI list (`attachment:{n}` slots) */
    attachments: string[];
    /** The article author's pubky (ownership check for attachment refs) */
    authorId: string;
    /** Composite post id (local files store key for same-session previews) */
    postId: string;
  };
  /** Compact visibly raw HTTP(S) URLs to their host. Disable for non-post text such as profile bios. */
  compactUrls?: boolean;
  onLinkClick?: (url: string, e: React.MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
}

export type RemarkAnchorProps = ClassAttributes<HTMLAnchorElement> &
  AnchorHTMLAttributes<HTMLAnchorElement> &
  ExtraProps & { 'data-type'?: string };

export type RemarkButtonProps = ClassAttributes<HTMLButtonElement> &
  ButtonHTMLAttributes<HTMLButtonElement> &
  ExtraProps & { 'data-type'?: string };
