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
}
