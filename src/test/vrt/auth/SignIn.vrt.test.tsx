// Preserve browser mock initialization order.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { usePassportEligibility } from '@/hooks/usePassportEligibility/usePassportEligibility';
import { Header } from '@/organisms/Header/Header';
import { SignInPage } from '@/templates/Auth/SignInPage/SignInPage';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/sign-in',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook({
    currentUserPubky: null,
    hasHydrated: true,
    session: null,
    sessionReference: null,
    restoreStatus: 'idle',
  }),
}));
vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({ isCoreExploreRoute: false, isDynamicPublicRoute: false }),
}));
vi.mock('@/hooks/useMobileAuth/useMobileAuth', () => ({
  useMobileAuth: () => ({
    url: 'pubkyauth://signin_grant?relay=https%3A%2F%2Frelay.pubky.app&secret=vrt-fixed-sign-in-token',
    isLoading: false,
    isExpired: false,
    fetchUrl: vi.fn(),
    copyAuthUrl: vi.fn(),
    isOpeningRing: false,
    onAuthorizeClick: vi.fn(),
    isOpeningBitkit: false,
    onAuthorizeBitkitClick: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePassportEligibility/usePassportEligibility', () => ({
  usePassportEligibility: vi.fn(),
}));
vi.mock('@/hooks/usePassportAuth/usePassportAuth', () => ({
  usePassportAuth: () => ({ startPassportAuth: vi.fn(), isPending: false }),
}));

for (const [name, viewport] of [
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
] as const) {
  describe(`SignIn ${name}`, () => {
    it.each(['enabled', 'disabled'] as const)('renders with Passport %s', async (passportEligibility) => {
      vi.mocked(usePassportEligibility).mockReturnValue(passportEligibility);
      await renderForVRT(
        <>
          <Header />
          <SignInPage />
        </>,
        { viewport },
      );
      if (name === 'mobile') {
        await expect.element(page.getByRole('button', { name: 'Authorize with Pubky Ring' })).toBeVisible();
        await expect.element(page.getByRole('button', { name: 'Authorize with Bitkit' })).toBeVisible();
      } else {
        await expect.element(page.getByRole('button', { name: 'Copy authentication link' })).toBeVisible();
      }
      await matchVrtFrameScreenshot(`sign-in-passport-${passportEligibility}-${name}`);
    });
  });
}
