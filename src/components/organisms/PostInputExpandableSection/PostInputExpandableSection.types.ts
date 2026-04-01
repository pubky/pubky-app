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
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  onSubmit: () => void | Promise<void>;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (open: boolean) => void;
  onEmojiSelect: (emoji: { native: string }) => void;
  onImageClick?: () => void;
  onArticleClick?: () => void;
  className?: string;
  characterLimit?: CharacterLimit;
}
