'use client';

import { useEffect } from 'react';
import { Dialog, DialogContent } from '@/atoms/Dialog/Dialog';
import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useFeedback } from '@/hooks/useFeedback/useFeedback';
import { DialogConfirmDiscard } from '@/molecules/DialogConfirmDiscard/DialogConfirmDiscard';
import type { DialogFeedbackProps } from './DialogFeedback.types';
import { DialogFeedbackContent } from './DialogFeedbackContent/DialogFeedbackContent';
import { DialogFeedbackSuccess } from './DialogFeedbackSuccess/DialogFeedbackSuccess';

export function DialogFeedback({ open, onOpenChange }: DialogFeedbackProps) {
  const { currentUserPubky } = useCurrentUserProfile();
  const { feedback, handleChange, submit, isSubmitting, isSuccess, hasContent, reset } = useFeedback();
  const { showConfirmDialog, setShowConfirmDialog, handleOpenChange, handleDiscard } = useConfirmableDialog({
    onClose: () => onOpenChange(false),
    hasContent: () => hasContent && !isSuccess,
  });

  // Reset state when the dialog closes
  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  // This may take some time to load, so we don't want to show the dialog until it's ready, cause we need this variable down the line.
  if (!currentUserPubky) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent avoidKeyboard className="w-2xl" hiddenTitle="Provide Feedback">
        {isSuccess ? (
          <DialogFeedbackSuccess onOpenChange={onOpenChange} />
        ) : (
          <DialogFeedbackContent
            feedback={feedback}
            handleChange={handleChange}
            submit={submit}
            isSubmitting={isSubmitting}
            hasContent={hasContent}
            currentUserPubky={currentUserPubky}
          />
        )}
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
