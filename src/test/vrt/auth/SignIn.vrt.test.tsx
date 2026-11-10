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
  ['figma-mobile', { width: 375, height: 812 }],
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
      if (name !== 'desktop') {
        await expect.element(page.getByRole('button', { name: 'Continue with Pubky Ring' })).toBeVisible();
        await expect.element(page.getByRole('button', { name: 'Continue with Bitkit' })).toBeVisible();
        const signerButtons = ['Continue with Pubky Ring', 'Continue with Bitkit'];
        if (passportEligibility === 'enabled') signerButtons.push('Continue with Google or Apple');
        for (const label of signerButtons) {
          expect(page.getByRole('button', { name: label }).element().getBoundingClientRect().height).toBe(60);
        }
        if (passportEligibility === 'enabled') {
          expect(
            page
              .getByRole('button', { name: 'About signing in with Apple or Google' })
              .element()
              .getBoundingClientRect().height,
          ).toBe(32);
          const sovereign = page.getByTestId('sign-in-sovereign-card-mobile').element().getBoundingClientRect();
          const passport = page.getByTestId('passport-method-section').element().getBoundingClientRect();
          expect(sovereign.height).toBeCloseTo(228, 0);
          expect(passport.height).toBeCloseTo(152, 0);
          expect(passport.top - sovereign.bottom).toBeCloseTo(24, 0);
          for (const card of [sovereign, passport]) {
            expect(card.left).toBeCloseTo(16, 0);
            expect(card.width).toBeCloseTo(viewport.width - 32, 0);
          }
          if (name === 'figma-mobile') expect(sovereign.top).toBeCloseTo(216, 0);
        }
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewport.width);
      } else {
        await expect.element(page.getByRole('button', { name: 'Copy authentication link' })).toBeVisible();
      }
      await matchVrtFrameScreenshot(`sign-in-passport-${passportEligibility}-${name}`);
    });
  });
}

// Preserve the provider presentation covered by the existing baselines.
vi.mock('@/config/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/network')>()),
  isPassportAppleEnabled: () => true,
}));
