// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { Landing } from '@/templates/Public/Landing/Landing';
import { LandingFinalSection } from '@/templates/Public/Landing/LandingFinalSection';
import { LandingFreedomSection } from '@/templates/Public/Landing/LandingFreedomSection';

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

  it.each([
    { name: 'desktop', viewport: VRT_VIEWPORT_DESKTOP },
    { name: 'tablet', viewport: { width: 768, height: 1024 } },
    { name: 'mobile', viewport: VRT_VIEWPORT_MOBILE },
  ])('positions the seven slide dots and arrow on $name', async ({ name, viewport }) => {
    await preloadImages(['/images/landing-experience7.webp']);
    await renderForVRT(<LandingFreedomSection />, { viewport });
    const firstHeading = page.getByRole('heading', { name: 'Create without limits' });
    await expect.element(firstHeading).toBeVisible();
    const navigation = page.getByRole('group', { name: 'Slide navigation' }).element();
    expect(navigation.getBoundingClientRect().top).toBeGreaterThan(
      firstHeading.element().parentElement!.getBoundingClientRect().bottom,
    );

    await page.getByRole('button', { name: 'Go to slide 7: Make a living' }).click();
    const heading = page.getByRole('heading', { name: 'Make a living' });
    await expect.element(heading).toBeVisible();
    await heading.hover();

    const dots = navigation.querySelectorAll('button > span');
    const arrow = page.getByRole('button', { name: 'Next slide' }).element().getBoundingClientRect();
    expect(dots).toHaveLength(7);
    expect(dots[0].getBoundingClientRect().left).toBeCloseTo(heading.element().getBoundingClientRect().left, 0);

    dots.forEach((dot, index) => {
      const bounds = dot.getBoundingClientRect();
      if (name !== 'mobile') {
        expect(bounds.top + bounds.height / 2).toBeCloseTo(arrow.top + arrow.height / 2, 0);
        expect(bounds.right).toBeLessThanOrEqual(arrow.left);
      }
      expect(getComputedStyle(dot).opacity).toBe(index === 6 ? '1' : '0.3');
    });
    if (name === 'mobile') {
      const article = page.getByRole('article').element();
      const image = article.querySelector('[style*="background-image"]');
      expect(image).not.toBeNull();
      const navigationBounds = navigation.getBoundingClientRect();
      const copyBounds = heading.element().parentElement!.getBoundingClientRect();
      expect(navigationBounds.top).toBeGreaterThan(copyBounds.bottom);
      expect(navigationBounds.bottom).toBeLessThanOrEqual(image!.getBoundingClientRect().top);
      expect(article.getBoundingClientRect().bottom - arrow.bottom).toBeCloseTo(32, 0);
      expect(article.getBoundingClientRect().right - arrow.right).toBeCloseTo(32, 0);
    }
    expect(navigation.querySelector('[aria-current="true"]')).toHaveAccessibleName('Go to slide 7: Make a living');

    const restingColor = getComputedStyle(dots[6]).backgroundColor;
    await page.getByRole('button', { name: 'Go to slide 7: Make a living' }).hover();
    expect(getComputedStyle(dots[6]).backgroundColor).toBe(restingColor);
    expect(getComputedStyle(dots[6]).opacity).toBe('0.5');
    expect(getComputedStyle(dots[6]).scale).toBe('1.25');
  });

  it('distinguishes the footer link without relying on colour or underlining', async () => {
    await renderForVRT(<LandingFinalSection />, { viewport: VRT_VIEWPORT_DESKTOP });
    const link = page.getByRole('link', { name: 'Pubky Protocol' });
    const linkStyle = getComputedStyle(link.element());
    const paragraphStyle = getComputedStyle(link.element().closest('p')!);

    expect(Number(linkStyle.fontWeight)).toBeGreaterThan(Number(paragraphStyle.fontWeight));
    expect(linkStyle.textDecorationLine).toBe('none');
    await link.hover();
    expect(getComputedStyle(link.element()).textDecorationLine).toBe('none');
  });
});
