'use client';

import { useRouter } from 'next/navigation';
import { AUTH_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { useContextualBanner } from '@/hooks/useContextualBanner/useContextualBanner';
import { useJoinRoute } from '@/hooks/useJoinRoute/useJoinRoute';
import { usePassportAuth } from '@/hooks/usePassportAuth/usePassportAuth';
import type { PassportAttemptSettledEvent } from '@/hooks/usePassportAuth/usePassportAuth.types';
import { usePassportEligibility } from '@/hooks/usePassportEligibility/usePassportEligibility';
import { ContextualBanner } from '@/molecules/ContextualBanner/ContextualBanner';
import { useAuthStore } from '@/stores/auth/auth.store';

/**
 * GuestContextualBanner
 *
 * Invites guests reading shared content (post, article, video, reply, profile, single collection)
 * to join. Mounted once in the root layout so its timer survives client navigation between those
 * pages; `useContextualBanner` owns when it shows and what it says.
 *
 * "Continue with Google" runs the Pubky Passport popup in place. The route guard never redirects
 * dynamic public routes, so a brand-new Passport account (no profile yet) is sent to profile
 * creation here; an existing account stays on the page it was reading.
 */
export function GuestContextualBanner() {
  const router = useRouter();
  const { visible, copy } = useContextualBanner();
  const joinRoute = useJoinRoute();
  const passportEligibility = usePassportEligibility();
  const handlePassportSettled = ({ result }: PassportAttemptSettledEvent) => {
    if (result === 'session' && useAuthStore.getState().hasProfile === false) {
      router.push(ONBOARDING_ROUTES.PROFILE);
    }
  };
  const { startPassportAuth, isPending } = usePassportAuth({ onAttemptSettled: handlePassportSettled });

  if (!visible) return null;

  return (
    <>
      {/* Lets the end of the page scroll clear of the fixed banner. */}
      <div aria-hidden="true" className="h-36 lg:h-28" />
      <ContextualBanner
        headline={copy.headline}
        body={copy.body}
        joinHref={joinRoute}
        signInHref={AUTH_ROUTES.SIGN_IN}
        onContinueWithGoogle={passportEligibility === 'enabled' ? startPassportAuth : undefined}
        isGooglePending={isPending}
      />
    </>
  );
}
