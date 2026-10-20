import type * as React from 'react';
import type { PostInputVariant } from '../PostInput/PostInput.types';

export type PostInputActionSubmitMode = PostInputVariant;

export interface PostInputActionBarProps {
  onEmojiClick?: () => void;
  onImageClick?: () => void;
  onArticleClick?: () => void;
  onPostClick?: () => void;
  isPostDisabled?: boolean;
  isSubmitting?: boolean;
  postButtonLabel?: string;
  postButtonAriaLabel?: string;
  postButtonIcon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  hideArticleButton: boolean;
  isArticle?: boolean;
  /** Creator-only "lock content" toggle. Rendered only when provided. */
  lockSwitch?: { checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean };
  /** Rendered before the action buttons (the article composer puts the author's avatar here). */
  leadingContent?: React.ReactNode;
  /** Browser fullscreen toggle. Rendered only when provided (articles, where the API is available). */
  fullscreen?: { isFullscreen: boolean; onToggle: () => void };
}
