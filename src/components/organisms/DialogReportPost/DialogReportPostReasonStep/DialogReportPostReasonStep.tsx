'use client';

import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import { REPORT_REASON_MAX_LENGTH } from '@/core/pipes/report';
import type { DialogReportPostReasonStepProps } from './DialogReportPostReasonStep.types';
import { Loader2 } from 'lucide-react';
import { getCharacterCount } from '@/libs/utils/utils';

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
      <Atoms.DialogHeader>
        <Atoms.DialogTitle>Report Post</Atoms.DialogTitle>
        <Atoms.DialogDescription>
          Please describe the reason why you&apos;re reporting this post.
        </Atoms.DialogDescription>
      </Atoms.DialogHeader>

      <Atoms.Container className="gap-4 py-2">
        {/* User info card with textarea inside - same pattern as PostInput */}
        <Atoms.Container className="rounded-lg border border-dashed border-border p-4" overrideDefaults>
          <Atoms.Container className="gap-4">
            {currentUserPubky && (
              <Organisms.PostHeader
                postId={currentUserPubky}
                isReplyInput={true}
                characterLimit={{
                  count: getCharacterCount(reason),
                  max: REPORT_REASON_MAX_LENGTH,
                }}
              />
            )}

            <Atoms.Textarea
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
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.Container>

      <Atoms.DialogFooter>
        <Atoms.Button
          data-cy="report-reason-step-cancel"
          variant="secondary"
          size="lg"
          onClick={onCancel}
          disabled={isSubmitting}
          aria-label="Cancel report"
        >
          Cancel
        </Atoms.Button>
        <Atoms.Button
          data-cy="report-reason-step-submit"
          variant="dark-outline"
          size="lg"
          onClick={onSubmit}
          disabled={!hasContent || isSubmitting}
          aria-label={isSubmitting ? 'Submitting report' : 'Submit report'}
        >
          {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : 'Report Post'}
        </Atoms.Button>
      </Atoms.DialogFooter>
    </>
  );
}
