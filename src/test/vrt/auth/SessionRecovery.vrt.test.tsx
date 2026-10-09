// Preserve browser mock initialization order.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { SessionRecovery } from '@/organisms/SessionRecovery/SessionRecovery';

vi.mock('@/hooks/useMobileAuth/useMobileAuth', () => ({
  useMobileAuth: () => ({
    url: 'pubkyauth://grant',
    isLoading: false,
    isExpired: false,
    fetchUrl: vi.fn(),
    onAuthorizeClick: vi.fn(),
  }),
}));
vi.mock('@/hooks/useSessionRecovery/useSessionRecovery', () => ({ useSessionRecovery: () => ({ retry: vi.fn() }) }));
vi.mock('@/hooks/usePassportEligibility/usePassportEligibility', () => ({ usePassportEligibility: () => 'enabled' }));
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
  describe(`SessionRecovery ${name}`, () => {
    it('renders all same-account authorization options', async () => {
      await renderForVRT(<SessionRecovery needsAuthorization />, { viewport });
      await expect.element(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      await expect.element(page.getByRole('link', { name: 'Sign out' })).toBeVisible();
      await matchVrtFrameScreenshot(`session-authorization-${name}`);
    });

    it('keeps retry and logout available for a temporary failure', async () => {
      await renderForVRT(<SessionRecovery needsAuthorization={false} />, { viewport });
      await expect.element(page.getByRole('button', { name: 'Retry saved session' })).toBeVisible();
      await expect.element(page.getByRole('link', { name: 'Sign out' })).toBeVisible();
      await matchVrtFrameScreenshot(`session-retry-${name}`);
    });
  });
}
