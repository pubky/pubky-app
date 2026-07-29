// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { Landing } from '@/templates/Public/Landing/Landing';

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
// desktop layout slot (aspect-video card) as a static stand-in.
vi.mock('@/templates/Public/Landing/LandingVideo', async () => {
  const { createElement } = await import('react');
  return {
    LandingVideo: () =>
      createElement(
        'aside',
        {
          className: 'relative z-0 w-full max-w-[460px] md:max-w-[560px] lg:max-w-none lg:pt-20',
          'aria-label': 'Landing video',
        },
        createElement('div', {
          className:
            'aspect-video w-full overflow-hidden rounded-md border border-border bg-muted shadow-xl shadow-black/20',
        }),
      ),
  };
});

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
    const screen = await renderForVRT(<LandingWithHeader />, { viewport: VRT_VIEWPORT_DESKTOP });
    // Viewport-clamped root: first fold only (hero is min-h-svh; lower
    // sections are intentionally cropped — see docs/visual-regression-testing.md).
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('landing-desktop');
  });

  it('renders the landing hero at mobile viewport', async () => {
    const screen = await renderForVRT(<LandingWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('landing-mobile');
  });
});
