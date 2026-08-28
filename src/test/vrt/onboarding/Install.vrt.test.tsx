// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, it, vi } from 'vitest';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { Install } from '@/templates/Onboarding/Install/Install';

// The real app mounts <Header /> from the root layout above every page; on
// /onboarding/* it renders the "Create account" step bar (1–5). Render it here
// so the snapshot matches what the user actually sees.
function InstallWithHeader() {
  return (
    <>
      <Header />
      <Install />
    </>
  );
}

// No `inviteCode` search param → `isVerifying` stays false and the full install
// content (header / card / footer / navigation) renders. This is the default,
// data-free state we snapshot.
vi.mock('next/navigation', () => {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  };
  const searchParams = new URLSearchParams();
  return {
    useRouter: () => router,
    usePathname: () => '/onboarding/install',
    useSearchParams: () => searchParams,
    useParams: () => ({}),
  };
});

// Toast is only fired from the invite-code verification effect (never hit in the
// default snapshot), but the hook is called unconditionally at render.
vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
  // `showErrorToast` imports the standalone `toast` binding.
  toast: vi.fn(),
}));

vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: createZustandLikeHook({
    secretKey: null as string | null,
    inviteCode: null as string | null,
    setInviteCode: vi.fn(),
    reset: vi.fn(),
    hasHydrated: true,
  }),
}));

// Header reads auth + public-route state. Install (step 2) is pre-auth.
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook({
    currentUserPubky: null as string | null,
    hasHydrated: true,
  }),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({ isCoreExploreRoute: false, isDynamicPublicRoute: false }),
}));

describe('Install (onboarding) — visual regression', () => {
  it('renders the install page at desktop viewport', async () => {
    await renderForVRT(<InstallWithHeader />, { viewport: VRT_VIEWPORT_DESKTOP });
    await matchVrtFrameScreenshot('onboarding-install-desktop');
  });

  it('renders the install page at mobile viewport', async () => {
    await renderForVRT(<InstallWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await matchVrtFrameScreenshot('onboarding-install-mobile');
  });
});
