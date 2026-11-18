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
import { OnboardingScanPage } from '@/templates/Onboarding/OnboardingScanPage/OnboardingScanPage';

// Preload images into cache to guarantee they render before snapshot.
const SCAN_PAGE_IMAGE_URLS = ['/images/scan.webp', '/images/ring-logo.svg', '/images/logo-pubky-ring.svg'];
const BITKIT_SCAN_PAGE_IMAGE_URLS = ['/images/scan.webp', '/images/bitkit-qr-logo.svg', '/images/bitkit-logo.svg'];

// The real app mounts <Header /> from the root layout above every page; on
// /onboarding/* it renders the "Create account" step bar (1–5). Render it here
// so the snapshot matches what the user actually sees.
function ScanWithHeader() {
  return (
    <>
      <Header />
      <OnboardingScanPage />
    </>
  );
}

// Two dynamic sources must be pinned for a stable QR:
//   1. `inviteCode` — empty would early-return null + redirect, so set a fixed
//      code (also rendered verbatim under the QR).
//   2. `useMobileAuth` — issues the auth URL the QR encodes. Left real, it hits
//      the network and the URL (and therefore the QR matrix) changes every run.
//      Pin it to a constant URL in the ready, non-expired state so QRCodeSVG
//      renders an identical matrix on every run and OS.
// The keychain picked on the Install step (`?keychain=bitkit`); Pubky Ring when empty.
const { scanSearchParams } = vi.hoisted(() => ({ scanSearchParams: { value: new URLSearchParams() } }));

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
    usePathname: () => '/onboarding/scan',
    useSearchParams: () => scanSearchParams.value,
    useParams: () => ({}),
  };
});

vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: createZustandLikeHook({
    inviteCode: 'VRT0CODE000001',
    setInviteCode: vi.fn(),
    reset: vi.fn(),
    hasHydrated: true,
  }),
}));

vi.mock('@/hooks/useMobileAuth/useMobileAuth', () => ({
  useMobileAuth: () => ({
    url: 'https://pubky.app/vrt-auth-fixed-signup-token',
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

// Header reads auth + public-route state. Scan (step 3) is pre-auth.
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook({
    currentUserPubky: null as string | null,
    hasHydrated: true,
  }),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({ isCoreExploreRoute: false, isDynamicPublicRoute: false }),
}));

describe('OnboardingScanPage (onboarding) — visual regression', () => {
  beforeEach(() => {
    scanSearchParams.value = new URLSearchParams();
  });

  it('renders the scan/QR page at desktop viewport', async () => {
    await preloadImages(SCAN_PAGE_IMAGE_URLS);
    await renderForVRT(<ScanWithHeader />, { viewport: VRT_VIEWPORT_DESKTOP });
    await matchVrtFrameScreenshot('onboarding-scan-desktop');
  });

  it('renders the scan/QR page at mobile viewport', async () => {
    await preloadImages(SCAN_PAGE_IMAGE_URLS);
    await renderForVRT(<ScanWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect.element(page.getByRole('button', { name: 'Authorize & configure', exact: true })).toBeEnabled();
    await expect.element(page.getByRole('img', { name: 'Bitkit' })).not.toBeInTheDocument();
    await matchVrtFrameScreenshot('onboarding-scan-mobile');
  });

  it('renders the Bitkit scan/QR page at desktop viewport', async () => {
    scanSearchParams.value = new URLSearchParams({ keychain: 'bitkit' });
    await preloadImages(BITKIT_SCAN_PAGE_IMAGE_URLS);
    await renderForVRT(<ScanWithHeader />, { viewport: VRT_VIEWPORT_DESKTOP });
    await matchVrtFrameScreenshot('onboarding-scan-bitkit-desktop');
  });
});
