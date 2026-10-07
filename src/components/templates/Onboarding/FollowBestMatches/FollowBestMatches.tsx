'use client';

import { useExperienceCompletedGuard } from '@/hooks/useExperienceCompletedGuard/useExperienceCompletedGuard';
import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { FollowBestMatchesForm } from '@/organisms/FollowBestMatchesForm/FollowBestMatchesForm';
import { FollowBestMatchesHeader } from '@/organisms/FollowBestMatchesHeader/FollowBestMatchesHeader';

export function FollowBestMatches() {
  const { isReady } = useExperienceCompletedGuard();

  if (!isReady) {
    return null;
  }

  return (
    <OnboardingLayout testId="follow-best-matches-content">
      <FollowBestMatchesHeader />
      <FollowBestMatchesForm />
    </OnboardingLayout>
  );
}
