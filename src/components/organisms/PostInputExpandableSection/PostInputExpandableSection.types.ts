import type { ComponentType, ReactNode } from 'react';
import type {
  CharacterLimit,
  PostInputActionBarProps,
  PostInputActionSubmitMode,
} from '../PostInputActionBar/PostInputActionBar.types';

export interface PostInputExpandableSectionProps {
  isExpanded: boolean;
  content: string;
  tags: string[];
  isSubmitting: boolean;
  isArticle?: boolean;
  isDisabled?: boolean;
  /**
   * Whether the post button should be disabled.
   * When not provided, defaults to requiring content.
   * For reposts, this can be false even with empty content.
   */
  isPostDisabled?: boolean;
  submitMode: PostInputActionSubmitMode;
  /** Overrides the submit button label derived from `submitMode`. */
  submitLabel?: string;
  /** Overrides the submit button icon derived from `submitMode`. */
  submitIcon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  onSubmit: () => void | Promise<void>;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (open: boolean) => void;
  onEmojiSelect: (emoji: { native: string }) => void;
  onImageClick?: () => void;
  onArticleClick?: () => void;
  className?: string;
  /**
   * Optional compensation for vertical parent gap (in px) so spacing can animate out
   * together with height during exit.
   */
  parentGapPx?: number;
  characterLimit?: CharacterLimit;
  /** Creator-only "lock content" toggle in the action bar. Rendered only when provided. */
  lockSwitch?: PostInputActionBarProps['lockSwitch'];
  /**
   * Card standing in for the content the lock switch captured. It is only passed while the lock is on,
   * so its presence also hides the article button: an announcement may never be `long`.
   */
  lockCard?: ReactNode;
}
