'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { APP_ROUTES } from '@/app/routes';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import type { UseExperienceCompletedGuardResult } from './useExperienceCompletedGuard.types';

/**
 * useExperienceCompletedGuard
 *
 * Re-prompt guard shared by the onboarding "Experience" screens (Tags of interest,
 * Follow your best matches). An account that already finished the Experience flow is
 * redirected home and never sees these screens again.
 *
 * Completion is read once after hydration without subscribing to later writes: the guard
 * owns redirects for users who completed *before* entering the route, while the screen's
 * Finish handler owns navigation for completion during the current visit. Subscribing here
 * would cause a blank render plus a double redirect on Finish.
 *
 * `isReady` is false while the persisted completion map is still rehydrating (to avoid
 * flashing the screen at completed users) and when the redirect is in flight.
 */
export function useExperienceCompletedGuard(): UseExperienceCompletedGuardResult {
  const router = useRouter();
  const pubky = useAuthStore((state) => state.currentUserPubky);
  const hasHydrated = useOnboardingStore((state) => state.hasHydrated);
  const hasCompletedExperience =
    hasHydrated && pubky ? Boolean(useOnboardingStore.getState().experienceCompletedByPubky[pubky]) : false;

  useEffect(() => {
    if (hasHydrated && hasCompletedExperience) {
      router.replace(APP_ROUTES.HOME);
    }
  }, [hasHydrated, hasCompletedExperience, router]);

  return { isReady: hasHydrated && !hasCompletedExperience };
}
