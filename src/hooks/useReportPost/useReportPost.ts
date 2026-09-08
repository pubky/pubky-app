'use client';

import { useCallback, useState } from 'react';
import { POST_ROUTES } from '@/app/routes';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { postJson } from '@/libs/api/client-request';
import { Logger } from '@/libs/logger/logger';
import { parseCompositeId } from '@/models/models.utils';
import { toast } from '@/molecules/Toaster/toast';
import type { ReportIssueType } from '@/pipes/report/report.types';
import { REPORT_API_ENDPOINT, REPORT_POST_STEPS } from './useReportPost.constants';
import type { ReportPostStep } from './useReportPost.types';
import type { UseReportPostReturn } from './useReportPost.types';

/**
 * Hook to handle post reporting to Chatwoot.
 *
 * Manages the two-step reporting flow:
 * 1. Issue selection - user selects the type of issue
 * 2. Reason input - user provides detailed description
 *
 * @param postId - Composite post ID in format "author:postId"
 * @returns Report state and handlers
 */
export function useReportPost(postId: string): UseReportPostReturn {
  const { currentUserPubky, userDetails } = useCurrentUserProfile();
  const parsedId = parseCompositeId(postId);
  const postUrl = `${window.location.origin}${POST_ROUTES.POST}/${parsedId.pubky}/${parsedId.id}`;

  const [step, setStep] = useState<ReportPostStep>(REPORT_POST_STEPS.ISSUE_SELECTION);
  const [selectedIssueType, setSelectedIssueType] = useState<ReportIssueType | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const selectIssueType = (issueType: ReportIssueType) => {
    setSelectedIssueType(issueType);
    setStep(REPORT_POST_STEPS.REASON_INPUT);
  };

  const handleReasonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReason(e.target.value);
  };

  const submit = async () => {
    const trimmedReason = reason.trim();
    const canSubmit = trimmedReason && selectedIssueType && !isSubmitting;

    if (!canSubmit) return;

    if (!currentUserPubky || !userDetails?.name) {
      toast({ variant: 'error', description: 'Could not load profile' });
      return;
    }

    setIsSubmitting(true);

    try {
      await postJson(REPORT_API_ENDPOINT, {
        pubky: currentUserPubky,
        postUrl,
        issueType: selectedIssueType,
        reason: trimmedReason,
        name: userDetails.name,
      });

      setIsSuccess(true);
    } catch (err) {
      Logger.error('Error submitting report:', err);
      toast({
        variant: 'error',
        description: err instanceof Error ? err.message : 'Could not submit report. Try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = useCallback(() => {
    setStep(REPORT_POST_STEPS.ISSUE_SELECTION);
    setSelectedIssueType(null);
    setReason('');
    setIsSubmitting(false);
    setIsSuccess(false);
  }, []);

  const hasContent = reason.trim().length > 0;

  return {
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
  };
}
