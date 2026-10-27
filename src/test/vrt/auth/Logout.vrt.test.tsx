// Preserve browser mock initialization order.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { createCanceledError } from '@/libs/error/auth-flow-canceled';
import { Header } from '@/organisms/Header/Header';
import { Logout } from '@/templates/Auth/Logout/Logout';

// Passport eligibility and the inert Passport popup come from vrt.setup.ts.
// 'canceled' is the route's default failure. 'error' is any other logout failure,
// which this file captures alongside the in-progress screen.
const logoutFailure = vi.hoisted(() => ({ kind: 'canceled' as 'canceled' | 'error' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/logout',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook({
    hasHydrated: true,
    currentUserPubky: 'vrt-account',
    session: null,
    sessionReference: null,
    restoreStatus: 'idle',
    isLoggingOut: false,
    generation: '',
  }),
}));
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: createZustandLikeHook({
    secretKey: '',
    hasHydrated: true,
    clearSecrets: vi.fn(),
  }),
}));
vi.mock('@/libs/identity/identity', () => ({ Identity: { tryZ32FromSecret: () => 'vrt-account' } }));
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    logout: vi.fn(async () => {
      if (logoutFailure.kind === 'error') throw new Error('vrt logout failed');
      throw createCanceledError();
    }),
  },
}));
vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({ isCoreExploreRoute: false, isDynamicPublicRoute: false }),
}));

for (const [name, viewport] of [
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
] as const) {
  describe(`Logout ${name}`, () => {
    it.each(['backup', 'canceled', 'success', 'loading', 'error'] as const)('renders %s logout', async (state) => {
      logoutFailure.kind = state === 'error' ? 'error' : 'canceled';
      Object.assign(useOnboardingStore.getState(), { secretKey: state === 'backup' ? 'fixture-key' : '' });
      Object.assign(useAuthStore.getState(), {
        currentUserPubky: state === 'success' ? null : 'vrt-account',
        isLoggingOut: state === 'loading',
      });
      await renderForVRT(
        <>
          <Header />
          <Logout />
        </>,
        { viewport },
      );
      if (state === 'backup') {
        await expect.element(page.getByRole('heading', { name: 'Back up your key before signing out' })).toBeVisible();
        await expect.element(page.getByRole('button', { name: 'Done' })).toBeVisible();
        await expect.element(page.getByRole('button', { name: 'Homepage' })).toBeVisible();
      } else if (state === 'canceled') {
        await expect.element(page.getByRole('heading', { name: 'Your account changed' })).toBeVisible();
        await expect.element(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
      } else if (state === 'loading') {
        // isLoggingOut holds the route on "Signing you out..." so the effect cannot settle.
        await expect.element(page.getByRole('heading', { name: 'Signing you out...' })).toBeVisible();
        await expect.element(page.getByText("We're ending your session securely.")).toBeVisible();
      } else if (state === 'error') {
        await expect.element(page.getByRole('heading', { name: "We couldn't sign you out yet" })).toBeVisible();
        await expect.element(page.getByRole('button', { name: 'Retry' })).toBeVisible();
        await expect.element(page.getByRole('button', { name: 'Homepage' })).toBeVisible();
      } else await expect.element(page.getByText('You have signed out.')).toBeVisible();
      if (state !== 'success' && state !== 'loading') {
        const back = page.getByRole('button', { name: 'Homepage' }).element();
        expect(back.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
        expect(back.getBoundingClientRect().bottom).toBeLessThanOrEqual(viewport.height);
      }
      if (name === 'mobile' && state !== 'success' && state !== 'loading') {
        const navigation = page.getByRole('button', { name: 'Homepage' }).element().closest('.onboarding-nav');
        expect(navigation?.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(viewport.height - 1);
      }
      await matchVrtFrameScreenshot(`logout-${state}-${name}`);
    });
  });
}
