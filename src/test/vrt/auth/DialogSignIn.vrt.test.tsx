// Preserve browser mock initialization order.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
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
for (const [name, viewport] of [
  ['desktop', VRT_VIEWPORT_DESKTOP],
  ['mobile', VRT_VIEWPORT_MOBILE],
] as const) {
  describe(`DialogSignIn ${name}`, () => {
    it('renders the normal sign-in prompt', async () => {
      await renderForVRT(<DialogSignIn />, { viewport });
      await expect.element(page.getByRole('dialog')).toBeVisible();
      await expect.element(page.getByRole('link', { name: 'Sign In' })).toBeVisible();
      await matchVrtFrameScreenshot(`sign-in-${name}`);
    });
  });
}
