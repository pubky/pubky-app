// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { PublicKey } from '@/templates/Onboarding/PublicKey/PublicKey';

const { copyToClipboard } = vi.hoisted(() => ({ copyToClipboard: vi.fn() }));

vi.mock('@/hooks/useCopyToClipboard/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard }),
}));

// The real app mounts <Header /> from the root layout above every page; on
// /onboarding/* it renders the "Create account" step bar (1–5). Render it here
// so the snapshot matches what the user actually sees.
function PublicKeyWithHeader() {
  return (
    <>
      <Header />
      <PublicKey />
    </>
  );
}

// Fixed pubky so `PublicKeyCard` renders the generated-key success state (key
// string + success input) instead of the async "generating…" loading state.
// Inlined inside the auth-store factory below — vi.mock hoists above top-level
// consts, so a shared variable would be undefined at factory-eval time.

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
    usePathname: () => '/onboarding/pubky',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  };
});

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook({
    currentUserPubky: 'vrt000000000000000000000000000000000000000000alice01',
    hasHydrated: true,
  }),
}));

// `secretKey` non-null so the `generateSecrets()` effect is skipped — keeps the
// render free of crypto side effects and randomness.
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: createZustandLikeHook({
    secretKey: 'vrt-fixed-secret-key',
    inviteCode: null as string | null,
    setInviteCode: vi.fn(),
    reset: vi.fn(),
    hasHydrated: true,
  }),
}));

// Navigation's Continue button drives sign-up; inert in the snapshot.
vi.mock('@/hooks/useInviteCodeSignUp/useInviteCodeSignUp', () => ({
  useInviteCodeSignUp: () => ({ validateAndSignUp: vi.fn() }),
}));

// Avoid pulling the real crypto/Identity graph; the effect that would call this
// is gated off by the fixed `secretKey` anyway.
vi.mock('@/controllers/profile/profile', () => ({
  ProfileController: { generateSecrets: vi.fn() },
}));

// Header reads public-route state (auth store is mocked above).
vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({ isCoreExploreRoute: false, isDynamicPublicRoute: false }),
}));

describe('PublicKey (onboarding) — visual regression', () => {
  it('renders the public-key page at desktop viewport', async () => {
    await renderForVRT(<PublicKeyWithHeader />, { viewport: VRT_VIEWPORT_DESKTOP });
    await matchVrtFrameScreenshot('onboarding-pubky-desktop');
  });

  it('renders the public-key page at mobile viewport', async () => {
    await renderForVRT(<PublicKeyWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await matchVrtFrameScreenshot('onboarding-pubky-mobile');
  });
});

describe('PublicKey padded click target', () => {
  it.each([390, 1440])('copies the key from both padded edges at %ipx', async (width) => {
    const screen = await renderForVRT(<PublicKeyWithHeader />, { viewport: { width, height: 844 } });
    const input = screen.getByRole('textbox');
    const field = input.element().parentElement;
    expect(field).not.toBeNull();
    if (!field) return;
    const bounds = field.getBoundingClientRect();
    const x = input.element().getBoundingClientRect().left - bounds.left + 40;

    for (const y of [10, bounds.height - 10]) {
      copyToClipboard.mockClear();
      await page.elementLocator(field).click({ position: { x, y } });
      expect(copyToClipboard).toHaveBeenCalledExactlyOnceWith(
        'pubkyvrt000000000000000000000000000000000000000000alice01',
      );
    }
  });
});
