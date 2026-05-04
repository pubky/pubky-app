'use client';

import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { showErrorToast as showErrorToastMessage } from '@/molecules/Toaster/showErrorToast';

import { POST_ROUTES } from '@/app/routes';
import { REPORT_POST_STEPS, REPORT_API_ENDPOINT } from './useReportPost.constants';
import type { ReportPostStep } from './useReportPost.types';
import type { UseReportPostReturn } from './useReportPost.types';
import { Logger } from '@/libs/logger/logger';
import { postJson } from '@/libs/api/client-request';
import { parseCompositeId } from '@/models/models.utils';
import type { ReportIssueType } from '@/pipes/report/report.types';
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
  const tReport = useTranslations('toast.report');
  const parsedId = parseCompositeId(postId);
  const postUrl = `${window.location.origin}${POST_ROUTES.POST}/${parsedId.pubky}/${parsedId.id}`;

  const [step, setStep] = useState<ReportPostStep>(REPORT_POST_STEPS.ISSUE_SELECTION);
  const [selectedIssueType, setSelectedIssueType] = useState<ReportIssueType | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const showErrorToast = (description: string) => {
    showErrorToastMessage({
      description,
    });
  };

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
      showErrorToast(tReport('userNotLoaded'));
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
      showErrorToast(err instanceof Error ? err.message : tReport('submitFailedDesc'));
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
