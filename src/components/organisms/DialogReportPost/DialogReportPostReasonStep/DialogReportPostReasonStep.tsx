'use client';

import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { PostHeader } from '../../PostHeader/PostHeader';

import type { DialogReportPostReasonStepProps } from './DialogReportPostReasonStep.types';
import { Loader2 } from 'lucide-react';
import { getCharacterCount } from '@/libs/utils/utils';
import { REPORT_REASON_MAX_LENGTH } from '@/pipes/report/report.constants';
export function DialogReportPostReasonStep({
  reason,
  hasContent,
  isSubmitting,
  onReasonChange,
  onCancel,
  onSubmit,
}: DialogReportPostReasonStepProps) {
  const { currentUserPubky } = useCurrentUserProfile();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Report Post</DialogTitle>
        <DialogDescription>Please describe the reason why you&apos;re reporting this post.</DialogDescription>
      </DialogHeader>

      <Container className="gap-4 py-2">
        {/* User info card with textarea inside - same pattern as PostInput */}
        <Container className="rounded-lg border border-dashed border-border p-4" overrideDefaults>
          <Container className="gap-4">
            {currentUserPubky && (
              <PostHeader
                postId={currentUserPubky}
                isReplyInput={true}
                characterLimit={{
                  count: getCharacterCount(reason),
                  max: REPORT_REASON_MAX_LENGTH,
                }}
              />
            )}

            <Textarea
              data-cy="report-reason-input"
              aria-label="Report reason"
              placeholder="Why are you reporting?"
              variant="inline"
              className="min-h-20 text-base"
              value={reason}
              onChange={onReasonChange}
              maxLength={REPORT_REASON_MAX_LENGTH}
              disabled={isSubmitting}
            />
          </Container>
        </Container>
      </Container>

      <DialogFooter>
        <Button
          data-cy="report-reason-step-cancel"
          variant="secondary"
          size="lg"
          onClick={onCancel}
          disabled={isSubmitting}
          aria-label="Cancel report"
        >
          Cancel
        </Button>
        <Button
          data-cy="report-reason-step-submit"
          variant="dark-outline"
          size="lg"
          onClick={onSubmit}
          disabled={!hasContent || isSubmitting}
          aria-label={isSubmitting ? 'Submitting report' : 'Submit report'}
        >
          {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : 'Report Post'}
        </Button>
      </DialogFooter>
    </>
  );
}
