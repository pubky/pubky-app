'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';
import { Logger } from '@/libs/logger/logger';
import { postJson } from '@/libs/api/client-request';

/**
 * Hook to handle feedback submission.
 *
 * Fetches current user data internally via useCurrentUserProfile.
 * Submission is guarded - requires authenticated user with loaded profile.
 *
 * @returns feedback - Current feedback text
 * @returns handleChange - Handler for textarea onChange
 * @returns submit - Async function to submit feedback
 * @returns isSubmitting - True while submission is in progress
 * @returns isSuccess - True after successful submission
 * @returns hasContent - True if feedback has non-whitespace content
 * @returns reset - Resets all state to initial values
 */
export function useFeedback() {
  const { currentUserPubky, userDetails } = Hooks.useCurrentUserProfile();
  const tFeedback = useTranslations('toast.feedback');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const showErrorToast = useCallback((description: string) => {
    Molecules.showErrorToast({ description });
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFeedback(e.target.value);
  }, []);

  const submit = useCallback(async () => {
    const currentFeedback = feedback.trim();

    if (!currentFeedback) return;
    if (isSubmitting) return;

    if (!currentUserPubky || !userDetails?.name) {
      showErrorToast(tFeedback('userNotLoaded'));
      return;
    }

    setIsSubmitting(true);
    try {
      await postJson('/api/feedback', {
        pubky: currentUserPubky,
        comment: currentFeedback,
        name: userDetails.name,
      });

      setIsSuccess(true);
      // Note: feedback is cleared by reset() when dialog closes, no need to clear here
    } catch (error) {
      Logger.error('Error submitting feedback:', error);
      showErrorToast(error instanceof Error ? error.message : tFeedback('submitFailedDesc'));
    } finally {
      setIsSubmitting(false);
    }
  }, [feedback, isSubmitting, currentUserPubky, userDetails?.name, showErrorToast, tFeedback]);

  const reset = useCallback(() => {
    setFeedback('');
    setIsSuccess(false);
    setIsSubmitting(false);
  }, []);

  const hasContent = useMemo(() => feedback.trim().length > 0, [feedback]);

  return {
    feedback,
    handleChange,
    submit,
    isSubmitting,
    isSuccess,
    hasContent,
    reset,
  };
}
