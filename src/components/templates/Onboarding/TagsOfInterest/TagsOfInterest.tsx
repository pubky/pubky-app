'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { APP_ROUTES } from '@/app/routes';
import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { TagsOfInterestForm } from '@/organisms/TagsOfInterestForm/TagsOfInterestForm';
import { TagsOfInterestHeader } from '@/organisms/TagsOfInterestHeader/TagsOfInterestHeader';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';

export function TagsOfInterest() {
  const router = useRouter();
  const pubky = useAuthStore((state) => state.currentUserPubky);
  const hasHydrated = useOnboardingStore((state) => state.hasHydrated);
  // Read completion after hydration without subscribing to later writes. The guard owns
  // redirects for users who completed before entering this route; the form owns navigation
  // for completion during the current visit, avoiding a blank render and double redirect.
  const hasCompletedExperience =
    hasHydrated && pubky ? Boolean(useOnboardingStore.getState().experienceCompletedByPubky[pubky]) : false;

  // Re-prompt guard: an account that already finished the Experience flow never sees it again.
  useEffect(() => {
    if (hasHydrated && hasCompletedExperience) {
      router.replace(APP_ROUTES.HOME);
    }
  }, [hasHydrated, hasCompletedExperience, router]);

  // Hold rendering until the persisted completion map is rehydrated to avoid flashing
  // the screen at completed users before the guard can redirect.
  if (!hasHydrated || hasCompletedExperience) {
    return null;
  }

  return (
    <OnboardingLayout testId="tags-of-interest-content">
      <TagsOfInterestHeader />
      <TagsOfInterestForm />
    </OnboardingLayout>
  );
}
