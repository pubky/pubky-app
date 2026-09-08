'use client';

import { useExperienceCompletedGuard } from '@/hooks/useExperienceCompletedGuard/useExperienceCompletedGuard';
import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { TagsOfInterestForm } from '@/organisms/TagsOfInterestForm/TagsOfInterestForm';
import { TagsOfInterestHeader } from '@/organisms/TagsOfInterestHeader/TagsOfInterestHeader';

export function TagsOfInterest() {
  const { isReady } = useExperienceCompletedGuard();

  if (!isReady) {
    return null;
  }

  return (
    <OnboardingLayout testId="tags-of-interest-content">
      <TagsOfInterestHeader />
      <TagsOfInterestForm />
    </OnboardingLayout>
  );
}
