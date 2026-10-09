// Preserve browser mock initialization order.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { useAuthStore } from '@/stores/auth/auth.store';
import { DialogSignIn } from '@/organisms/DialogSignIn/DialogSignIn';

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook({
    showSignInDialog: true,
    setShowSignInDialog: vi.fn(),
    restoreStatus: 'restoring',
    currentUserPubky: 'vrt-account',
    sessionReference: null,
  }),
}));
vi.mock('@/hooks/useJoinRoute/useJoinRoute', () => ({ useJoinRoute: () => '/onboarding/human' }));
vi.mock('@/hooks/useMobileAuth/useMobileAuth', () => ({
  useMobileAuth: () => ({
    url: 'pubkyauth://grant',
    isLoading: false,
    isExpired: false,
    fetchUrl: vi.fn(),
    copyAuthUrl: vi.fn(),
    onAuthorizeClick: vi.fn(),
  }),
}));
vi.mock('@/hooks/useSessionRecovery/useSessionRecovery', () => ({ useSessionRecovery: () => ({ retry: vi.fn() }) }));
vi.mock('@/hooks/usePassportEligibility/usePassportEligibility', () => ({ usePassportEligibility: () => 'disabled' }));
vi.mock('@/hooks/usePassportAuth/usePassportAuth', () => ({
  usePassportAuth: () => ({ startPassportAuth: vi.fn(), isPending: false }),
}));
vi.mock('@/controllers/auth/auth', () => ({
  AuthController: { loginWithMnemonic: vi.fn(), loginWithEncryptedFile: vi.fn() },
}));

for (const [name, viewport] of [
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
] as const) {
  describe(`DialogSignIn ${name}`, () => {
    it.each(['restoring', 'temporary-error', 'reauth-required'] as const)('renders %s', async (restoreStatus) => {
      Object.assign(useAuthStore.getState(), { restoreStatus });
      await renderForVRT(<DialogSignIn />, { viewport });
      await expect.element(page.getByRole('dialog')).toBeVisible();
      if (restoreStatus === 'restoring')
        await expect
          .element(page.getByText('Restoring your session. Try your action again when it is ready.'))
          .toBeVisible();
      else await expect.element(page.getByRole('link', { name: 'Sign out' })).toBeVisible();
      await matchVrtFrameScreenshot(`sign-in-${restoreStatus}-${name}`);
    });
  });
}
