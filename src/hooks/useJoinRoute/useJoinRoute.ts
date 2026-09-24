'use client';

import { ONBOARDING_ROUTES } from '@/app/routes';
import { usePassportEligibility } from '@/hooks/usePassportEligibility/usePassportEligibility';

/**
 * First sign-up step for every "Join" / "New here?" entry point.
 *
 * `/onboarding/join` (own keys vs Continue with Google) only exists when Pubky Passport can run on
 * this page; otherwise, and while eligibility is still resolving, the classic fair-access step is
 * the entry so a click never lands on a page that would immediately redirect.
 */
export function useJoinRoute(): ONBOARDING_ROUTES {
  const eligibility = usePassportEligibility();
  return eligibility === 'enabled' ? ONBOARDING_ROUTES.JOIN : ONBOARDING_ROUTES.HUMAN;
}
