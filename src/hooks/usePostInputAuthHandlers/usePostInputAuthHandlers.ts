import type React from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import type {
  CreateKeyDownHandlerDeps,
  UsePostInputAuthHandlersOptions,
  UsePostInputAuthHandlersReturn,
} from './usePostInputAuthHandlers.types';

/**
 * Guest-interaction policy shared by `PostInput` and `QuickReply`.
 *
 * Wraps the data/submit handlers from `usePostInput` so that an unauthenticated
 * user is blocked and the global sign-in dialog is opened instead, while an
 * authenticated user reaches the underlying handler unchanged. This is the
 * single source of truth for explore-mode post/reply guarding.
 */
export function usePostInputAuthHandlers(options: UsePostInputAuthHandlersOptions): UsePostInputAuthHandlersReturn {
  const {
    handleExpand,
    handleSubmit,
    setTags,
    setAttachments,
    handleChange,
    handleFilesAdded,
    handleFileClick,
    handleEmojiSelect,
    handlePaste,
    handleArticleTitleChange,
    handleArticleBodyChange,
    handleArticleClick,
    removeExistingAttachment,
  } = options;

  const { isAuthenticated, requireAuth } = useRequireAuth();

  const openSignInDialog = () => {
    requireAuth(() => undefined);
  };

  /**
   * Block `handler` for guests — running `before` first (e.g. to
   * `preventDefault`) — and open the sign-in dialog; otherwise call through.
   * Generic over the handler args so `SetStateAction` and event types survive.
   */
  const guard =
    <TArgs extends unknown[]>(handler: (...args: TArgs) => void, before?: (...args: TArgs) => void) =>
    (...args: TArgs): void => {
      if (!isAuthenticated) {
        before?.(...args);
        openSignInDialog();
        return;
      }
      handler(...args);
    };

  const handleExpandWithAuth = () => {
    requireAuth(handleExpand);
  };

  const handleSubmitWithAuth = () => requireAuth(handleSubmit);

  const handleFileClickWithAuth = () => {
    requireAuth(handleFileClick);
  };

  const handleDragEventWithAuth = (event: React.DragEvent, handler: (event: React.DragEvent) => void) => {
    if (!isAuthenticated) {
      event.preventDefault();
      event.stopPropagation();
      openSignInDialog();
      return;
    }
    handler(event);
  };

  // Combined keyboard handler: mention popover takes priority, then enter submit.
  // A factory because `enterSubmitHandler` is built in the component from
  // `handleSubmitWithAuth`, i.e. after this hook runs.
  const createKeyDownHandler =
    ({ handleMentionKeyDown, enterSubmitHandler }: CreateKeyDownHandlerDeps) =>
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!isAuthenticated) {
        event.preventDefault();
        openSignInDialog();
        return;
      }
      if (handleMentionKeyDown(event)) return;
      enterSubmitHandler(event);
    };

  return {
    isAuthenticated,
    handleExpandWithAuth,
    handleSubmitWithAuth,
    setTagsWithAuth: guard(setTags),
    setAttachmentsWithAuth: guard(setAttachments),
    handleChangeWithAuth: guard(handleChange),
    handleFilesAddedWithAuth: guard(handleFilesAdded),
    handleFileClickWithAuth,
    handleEmojiSelectWithAuth: guard(handleEmojiSelect),
    handlePasteWithAuth: guard(handlePaste, (event) => event.preventDefault()),
    handleDragEventWithAuth,
    createKeyDownHandler,
    handleArticleTitleChangeWithAuth: handleArticleTitleChange ? guard(handleArticleTitleChange) : undefined,
    handleArticleBodyChangeWithAuth: handleArticleBodyChange ? guard(handleArticleBodyChange) : undefined,
    handleArticleClickWithAuth: handleArticleClick
      ? () => {
          requireAuth(handleArticleClick);
        }
      : undefined,
    removeExistingAttachmentWithAuth: removeExistingAttachment ? guard(removeExistingAttachment) : undefined,
  };
}
