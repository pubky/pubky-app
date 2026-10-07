// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, it, vi } from 'vitest';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { Landing } from '@/templates/Public/Landing/Landing';

// Preload images into cache to guarantee they render before snapshot.
// This ensures the logo and Synonym/"a tether. company" brand mark <img>s are loaded up front,
// preventing intermittent blank rendering in CI due to cold fetch racing initial paint.
const LANDING_LOGO_URLS = ['/pubky-logo.svg', '/images/synonym-grey-logo.svg', '/images/a-tether-company.svg'];

// Root layout mounts `<Header />` above every page. On `/` it renders
// HeaderHome (social links + sign in) for guests — include it so the
// snapshot matches the first fold users see.
function LandingWithHeader() {
  return (
    <>
      <Header />
      <Landing />
    </>
  );
}

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
    usePathname: () => '/',
    useSearchParams: () => searchParams,
    useParams: () => ({}),
  };
});

// Autoplaying `/pubky.mp4` would capture a non-deterministic frame. Keep the
// layout slot (aspect-video card) as a static stand-in, but only from `md` up:
// the real component returns null below it (`matchMedia` on BREAKPOINTS.md), so
// a stand-in that always renders would show a video the mobile page never has.
vi.mock('@/templates/Public/Landing/LandingVideo', async () => {
  const { createElement } = await import('react');
  return {
    LandingVideo: () =>
      createElement(
        'aside',
        {
          className: 'hidden md:block relative z-0 w-full max-w-[460px] md:max-w-[560px] lg:max-w-none lg:pt-20',
          'aria-label': 'Landing video',
        },
        createElement('div', {
          className:
            'aspect-video w-full overflow-hidden rounded-md border border-border bg-muted shadow-xl shadow-black/20',
        }),
      ),
  };
});

// `HomeActions` renders "Continue with Google" only when Passport eligibility
// resolves to `'enabled'`. The VRT page is served over http, so the real hook
// can only report `'pending'` or `'disabled'` here and the snapshot would miss a
// button the landing page shows in production.
vi.mock('@/hooks/usePassportEligibility/usePassportEligibility', () => ({
  usePassportEligibility: () => 'enabled',
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: createZustandLikeHook({
    currentUserPubky: null as string | null,
    hasHydrated: true,
    setShowSignInDialog: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({
    isCoreExploreRoute: false,
    isDynamicPublicRoute: false,
    isPublicExploreRoute: false,
  }),
}));

describe('Landing — visual regression', () => {
  it('renders the landing hero at desktop viewport', async () => {
    await preloadImages(LANDING_LOGO_URLS);
    await renderForVRT(<LandingWithHeader />, { viewport: VRT_VIEWPORT_DESKTOP });
    // Viewport-clamped root: first fold only (hero is min-h-svh; lower
    // sections are intentionally cropped — see docs/visual-regression-testing.md).
    await matchVrtFrameScreenshot('landing-desktop');
  });

  it('renders the landing hero at mobile viewport', async () => {
    await preloadImages(LANDING_LOGO_URLS);
    await renderForVRT(<LandingWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await matchVrtFrameScreenshot('landing-mobile');
  });
});
