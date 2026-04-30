'use client';

import { useReportPost } from '@/hooks/useReportPost/useReportPost';
import { useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';

import { REPORT_POST_STEPS } from '@/hooks/useReportPost/useReportPost.constants';
import { DialogReportPostIssueStep } from './DialogReportPostIssueStep/DialogReportPostIssueStep';
import { DialogReportPostReasonStep } from './DialogReportPostReasonStep/DialogReportPostReasonStep';
import { DialogReportPostSuccess } from './DialogReportPostSuccess/DialogReportPostSuccess';

import type { DialogReportPostProps } from './DialogReportPost.types';

export function DialogReportPost({ open, onOpenChange, postId }: DialogReportPostProps) {
  const {
    step,
    selectedIssueType,
    reason,
    isSubmitting,
    isSuccess,
    hasContent,
    selectIssueType,
    handleReasonChange,
    submit,
    reset,
  } = useReportPost(postId);

  // Reset state when the dialog closes
  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const handleCancel = () => {
    onOpenChange(false);
  };

  const renderContent = () => {
    if (isSuccess) {
      return <DialogReportPostSuccess onOpenChange={onOpenChange} />;
    }

    if (step === REPORT_POST_STEPS.REASON_INPUT && selectedIssueType !== null) {
      return (
        <DialogReportPostReasonStep
          reason={reason}
          hasContent={hasContent}
          isSubmitting={isSubmitting}
          onReasonChange={handleReasonChange}
          onCancel={handleCancel}
          onSubmit={submit}
        />
      );
    }

    return (
      <DialogReportPostIssueStep
        onSelectIssueType={selectIssueType}
        onCancel={handleCancel}
        onOpenChange={onOpenChange}
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-xl" hiddenTitle="Report Post" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="sr-only">Report Post</DialogTitle>
          <DialogDescription className="sr-only">Report post dialog</DialogDescription>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
