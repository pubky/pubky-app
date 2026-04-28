'use client';

import { useConfirmableDialog } from '@/hooks/useConfirmableDialog/useConfirmableDialog';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useFeedback } from '@/hooks/useFeedback/useFeedback';
import { useEffect } from 'react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import { DialogFeedbackContent } from './DialogFeedbackContent';
import { DialogFeedbackSuccess } from './DialogFeedbackSuccess';
import type { DialogFeedbackProps } from './DialogFeedback.types';

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
    <Atoms.Dialog open={open} onOpenChange={handleOpenChange}>
      <Atoms.DialogContent className="w-2xl" hiddenTitle="Provide Feedback">
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
        <Molecules.DialogConfirmDiscard
          open={showConfirmDialog}
          onOpenChange={() => setShowConfirmDialog(false)}
          onConfirm={handleDiscard}
        />
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}
