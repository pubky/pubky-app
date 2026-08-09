import type { RefObject } from 'react';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import type { AutocompleteUserData } from '@/hooks/useUserDetailsFromIds/useUserDetailsFromIds.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import type { PostHeaderProps } from '../PostHeader/PostHeader.types';

export interface QuickReplyProps {
  parentPostId: string;
  /** Thread connector variant - defaults to LAST for terminal thread positions */
  connectorVariant?: typeof POST_THREAD_CONNECTOR_VARIANTS.LAST | typeof POST_THREAD_CONNECTOR_VARIANTS.REGULAR;
  /** Callback when reply is successfully submitted */
  onReplySubmitted?: (replyId: string) => void;
}

/** Props shared by the layout-specific QuickReply content subcomponents. */
export interface QuickReplyContentProps {
  // Current user header
  currentUserPubky: string | null;
  currentUserDetails?: NexusUserDetails | null;

  // Textarea
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  content: string;
  displayPlaceholder: string;
  isSubmitting: boolean;
  isAuthenticated: boolean;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: React.ClipboardEvent) => void;

  // Mention autocomplete
  mentionIsOpen: boolean;
  mentionUsers: AutocompleteUserData[];
  mentionSelectedIndex: number | null;
  onMentionSelect: (userId: string) => void;
  onMentionHover: (index: number) => void;

  // Attachments
  fileInputRef: RefObject<HTMLInputElement | null>;
  attachments: File[];
  setAttachments: React.Dispatch<React.SetStateAction<File[]>>;
  onFilesAdded: (files: File[]) => void;

  // Expanded section / actions
  isExpanded: boolean;
  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  onSubmit: () => void | Promise<void>;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (open: boolean) => void;
  onEmojiSelect: (emoji: { native: string }) => void;
  onImageClick: () => void;
  isPostDisabled: boolean;
  characterLimit?: PostHeaderProps['characterLimit'];
}
