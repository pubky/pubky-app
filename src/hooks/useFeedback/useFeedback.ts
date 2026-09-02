'use client';

import { useCallback, useMemo, useState } from 'react';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { postJson } from '@/libs/api/client-request';
import { Logger } from '@/libs/logger/logger';
import { toast } from '@/molecules/Toaster/toast';

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
  const { currentUserPubky, userDetails } = useCurrentUserProfile();
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFeedback(e.target.value);
  }, []);

  const submit = useCallback(async () => {
    const currentFeedback = feedback.trim();

    if (!currentFeedback) return;
    if (isSubmitting) return;

    if (!currentUserPubky || !userDetails?.name) {
      toast({ variant: 'error', description: 'Could not load profile' });
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
      toast({
        variant: 'error',
        description: error instanceof Error ? error.message : 'Could not submit feedback. Try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [feedback, isSubmitting, currentUserPubky, userDetails?.name]);

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
