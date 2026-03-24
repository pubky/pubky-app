import { POST_INPUT_VARIANT } from './PostInput.constants';

export type PostInputVariant =
  | typeof POST_INPUT_VARIANT.REPLY
  | typeof POST_INPUT_VARIANT.POST
  | typeof POST_INPUT_VARIANT.REPOST
  | typeof POST_INPUT_VARIANT.EDIT;

interface PostInputBaseProps {
  /** Callback after successful post, receives the created post ID */
  onSuccess?: (createdPostId: string) => void;
  /** Custom placeholder text (default depends on variant) */
  placeholder?: string;
  /** Show the thread connector (for replies, default: false) */
  showThreadConnector?: boolean;
  /**
   * Controls whether the component starts in expanded mode.
   * When false (default), shows a compact version that expands on click/focus.
   * When true, shows the full version with tags and action bar visible.
   * @default false
   */
  expanded?: boolean;
  /** Callback when content, tags, attachments, or article title change, receives content, tags, attachments, and article title */
  onContentChange?: (content: string, tags: string[], attachments: File[], articleTitle: string) => void;
  /** Callback when article mode changes */
  onArticleModeChange?: (isArticle: boolean) => void;
  /** Data Cy for the post input */
  dataCy?: string;
  /**
   * Which input element to auto-focus on mount.
   *
   * Controls ref-based focus for PostInput's own input elements:
   * - 'textarea': the short-form post textarea (replies, regular post edits)
   *
   * MarkdownEditor is not included here — it manages its own focus via its
   * native autoFocus prop, since it is lazy-loaded and its ref isn't available
   * on first mount.
   *
   * Uses requestAnimationFrame internally to wait for Radix Dialog's
   * focus trap to finish before taking focus — without this, the dialog's
   * initial focus scan overrides the focus we set.
   *
   * Omit or leave undefined for no auto-focus.
   */
  autoFocusTarget?: 'textarea';
  /**
   * Initial content to pre-fill (e.g. from OS share target).
   * Note: Only applied on mount, subsequent prop changes are ignored.
   */
  initialContent?: string;
  /**
   * Initial file attachments to pre-fill (e.g. from OS share target).
   * Note: Only applied on mount, subsequent prop changes are ignored.
   */
  initialAttachments?: File[];
}

export type PostInputProps =
  | (PostInputBaseProps & {
      /** Variant: reply */
      variant: typeof POST_INPUT_VARIANT.REPLY;
      /** Parent post ID (required for replies) */
      postId: string;
      originalPostId?: never;
      editPostId?: never;
      editContent?: never;
      editIsArticle?: never;
    })
  | (PostInputBaseProps & {
      /** Variant: repost */
      variant: typeof POST_INPUT_VARIANT.REPOST;
      /** Original post ID (required for reposts) */
      originalPostId: string;
      postId?: never;
      editPostId?: never;
      editContent?: never;
      editIsArticle?: never;
    })
  | (PostInputBaseProps & {
      /** Variant: new root post */
      variant: typeof POST_INPUT_VARIANT.POST;
      postId?: never;
      originalPostId?: never;
      editPostId?: never;
      editContent?: never;
      editIsArticle?: never;
    })
  | (PostInputBaseProps & {
      /** Variant: edit post */
      variant: typeof POST_INPUT_VARIANT.EDIT;
      postId?: never;
      originalPostId?: never;
      /** Edit post ID (required for edit) */
      editPostId: string;
      /** Editable content (required for edit) */
      editContent: string;
      /** Editable article mode (required for edit) */
      editIsArticle: boolean;
    });
