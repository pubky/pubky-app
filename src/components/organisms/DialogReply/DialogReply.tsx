'use client';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { DialogConfirmDiscard } from '@/molecules/DialogConfirmDiscard/DialogConfirmDiscard';
import { GenericResourcePreview } from '@/molecules/PostLinkEmbeds/Providers/Generic/GenericResourcePreview';
import { PostPreviewCard } from '@/molecules/PostPreviewCard/PostPreviewCard';
import { PostPreviewNestingProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { PostInput } from '../PostInput/PostInput';
import type { DialogReplyProps } from './DialogReply.types';

/**
 * The reply composer under what it answers: a post, or an external resource's card. A reply to an
 * external resource is a post whose `parent` is the resource's URI.
 */
export function DialogReply({ postId, resourceUri, open, onOpenChangeAction }: DialogReplyProps) {
  // The reply's `parent`: the resource's URI as written, else the post.
  const replyTarget = resourceUri !== undefined ? { parentUri: resourceUri } : { postId };
  const { showConfirmDialog, setShowConfirmDialog, resetKey, handleContentChange, handleOpenChange, handleDiscard } =
    useConfirmableDialog({
      onClose: () => onOpenChangeAction(false),
    });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        avoidKeyboard
        className="flex max-h-[calc(100dvh-2rem)] w-3xl flex-col"
        hiddenTitle={resourceUri !== undefined ? 'Reply to external resource' : 'Reply to post'}
      >
        <DialogHeader>
          <DialogTitle>{'Reply'}</DialogTitle>
          <DialogDescription className="sr-only">{'Reply dialog'}</DialogDescription>
        </DialogHeader>
        <Container className="min-h-0 flex-1 gap-3 overflow-x-hidden overscroll-contain pr-1">
          {/* What is replied to — never a link, so the route cannot change behind the open modal */}
          {resourceUri !== undefined ? (
            // The card as a quoted post shows it: no footer, nothing that changes the route behind the
            // modal (its own link opens in a new tab).
            <PostPreviewNestingProvider navigable={false}>
              <GenericResourcePreview url={resourceUri} />
            </PostPreviewNestingProvider>
          ) : (
            <PostPreviewCard postId={postId} navigable={false} />
          )}

          {/* Reply input */}
          <Container className="relative w-full min-w-0 pl-6" overrideDefaults>
            <PostInput
              active={open}
              dataCy="reply-post-input"
              id="reply-post-input"
              key={resetKey}
              autoFocusTextarea
              variant={POST_INPUT_VARIANT.REPLY}
              {...replyTarget}
              onSuccess={() => {
                onOpenChangeAction(false);
              }}
              showThreadConnector={true}
              expanded={true}
              onContentChange={handleContentChange}
              layoutOverride="inline"
            />
          </Container>
        </Container>
        {/* Nested inside parent dialog to avoid mobile touch event issues with sibling portals */}
        <DialogConfirmDiscard
          open={showConfirmDialog}
          onOpenChange={() => setShowConfirmDialog(false)}
          onConfirm={handleDiscard}
        />
      </DialogContent>
    </Dialog>
  );
}
