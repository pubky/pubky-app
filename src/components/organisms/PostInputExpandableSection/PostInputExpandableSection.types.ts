import type { ComponentType } from 'react';
import type { CharacterLimit, PostInputActionSubmitMode } from '../PostInputActionBar/PostInputActionBar.types';

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
  /**
   * Hides the action bar (emoji/image/submit) while keeping embeds, tags and the
   * emoji dialog. Used by layouts that render their own inline actions (e.g. list).
   */
  hideActionBar?: boolean;
  /**
   * Renders the tag chips and the tags input together on a single wrapping row
   * instead of stacked. Used by the list layout.
   */
  inline?: boolean;
  characterLimit?: CharacterLimit;
}
