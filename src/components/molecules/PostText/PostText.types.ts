import { AnchorHTMLAttributes, ButtonHTMLAttributes, ClassAttributes } from 'react';
import type React from 'react';
import { ExtraProps } from 'react-markdown';

export interface PostTextProps {
  content: string;
  isArticle?: boolean;
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
