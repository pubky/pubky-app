// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { Join } from '@/templates/Onboarding/Join/Join';

// Join renders the keyring and Passport cloud artwork on desktop; the logo is
// in the header at every width.
const JOIN_IMAGE_URLS = [
  '/pubky-logo.svg',
  '/images/keyring.webp',
  '/images/passport-cloud.webp',
  '/images/synonym-grey-logo.svg',
  '/images/a-tether-company.svg',
];

// Root layout mounts <Header /> above every page; on /onboarding/join it renders
// the "Create account" step bar (step 1).
function JoinWithHeader() {
  return (
    <>
      <Header />
      <Join />
    </>
  );
}

// The shared setup resolves Passport eligibility to `'enabled'` and stubs the
// attempt as idle. Override the attempt here so the same file can also capture
// the "Waiting for Passport..." state that follows a Continue with Google click.
const passportAttempt = vi.hoisted(() => ({ isPending: false }));
const mockAppleEnabled = vi.hoisted(() => vi.fn(() => false));
vi.mock('@/hooks/usePassportAuth/usePassportAuth', () => ({
  usePassportAuth: () => ({ startPassportAuth: () => undefined, isPending: passportAttempt.isPending }),
}));

vi.mock('next/navigation', () => {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  };
  return {
    useRouter: () => router,
    usePathname: () => '/onboarding/join',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  };
});

// Header reads auth + public-route state. Join (step 1) is pre-auth.
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook({
    currentUserPubky: null as string | null,
    hasHydrated: true,
  }),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({ isCoreExploreRoute: false, isDynamicPublicRoute: false }),
}));

for (const [name, viewport] of [
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
  ['figma-mobile', { width: 375, height: 812 }],
] as const) {
  describe(`Join (onboarding, Passport) ${name} — visual regression`, () => {
    beforeEach(async () => {
      passportAttempt.isPending = false;
      mockAppleEnabled.mockReturnValue(false);
      await preloadImages(JOIN_IMAGE_URLS);
    });

    it('renders both sign-up methods with the compact Passport button', async () => {
      await renderForVRT(<JoinWithHeader />, { viewport });
      await expect.element(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
      await expect.element(page.getByRole('link', { name: 'Synonym' })).toBeVisible();
      await expect.element(page.getByRole('link', { name: 'a tether. company' })).toBeVisible();
      const subtitle = page.getByText('How would you like to create your pubky?');
      if (name !== 'desktop') {
        await expect.element(subtitle).not.toBeVisible();
      } else {
        await expect.element(subtitle).toBeVisible();
      }
      if (name === 'figma-mobile') {
        const sovereign = page.getByTestId('join-sovereign-card-mobile').element().getBoundingClientRect();
        const passport = page.getByTestId('passport-method-section').element().getBoundingClientRect();
        expect(sovereign.top).toBeCloseTo(216, 0);
        expect(passport.top - sovereign.bottom).toBeCloseTo(24, 0);
        for (const card of [sovereign, passport]) {
          expect(card.left).toBeCloseTo(16, 0);
          expect(card.width).toBeCloseTo(343, 0);
          expect(card.height).toBeCloseTo(152, 0);
        }
        for (const label of ['Manage your own keys', 'Continue with Google']) {
          const button = page.getByRole('button', { name: label, exact: true }).element().getBoundingClientRect();
          expect(button.left).toBeCloseTo(40, 0);
          expect(button.width).toBeCloseTo(295, 0);
          expect(button.height).toBeCloseTo(60, 0);
        }
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewport.width);
      }
      await matchVrtFrameScreenshot(`onboarding-join-${name}`);
    });

    it('renders the waiting state while a Passport attempt is pending', async () => {
      passportAttempt.isPending = true;
      await renderForVRT(<JoinWithHeader />, { viewport });
      await expect.element(page.getByRole('button', { name: 'Waiting for Passport...' })).toBeDisabled();
      await matchVrtFrameScreenshot(`onboarding-join-passport-pending-${name}`);
    });

    // Passport users skip the Backup step: Passport stores an encrypted backup
    // in Google Drive. This popover is where the app explains that backup and
    // how recovery works.
    it('renders the Passport backup and recovery explainer', async () => {
      await renderForVRT(<JoinWithHeader />, { viewport });
      await page.getByRole('button', { name: 'About signing in with Google' }).click();
      await expect.element(page.getByRole('heading', { name: 'Sign in with Google', exact: true })).toBeVisible();
      await matchVrtFrameScreenshot(`onboarding-join-passport-help-${name}`);
    });

    if (name === 'figma-mobile') {
      it('renders the provider button and its help when Apple is enabled', async () => {
        mockAppleEnabled.mockReturnValue(true);
        await renderForVRT(<JoinWithHeader />, { viewport });
        await expect.element(page.getByRole('button', { name: 'Continue with Google or Apple' })).toBeVisible();
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewport.width);
        await matchVrtFrameScreenshot('onboarding-join-apple-enabled-figma-mobile');
        await page.getByRole('button', { name: 'About signing in with Apple or Google' }).click();
        await expect.element(page.getByRole('heading', { name: 'Sign in with Apple or Google' })).toBeVisible();
      });
    }
  });
}

// Match the default deployment, with explicit Apple-enabled coverage above.
vi.mock('@/config/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/network')>()),
  isPassportAppleEnabled: mockAppleEnabled,
}));
