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
import { HomeFooter } from '@/molecules/Home/Home';

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
    { name: 'small desktop', viewport: { width: 1060, height: 1024 } },
    { name: 'landscape tablet', viewport: { width: 1024, height: 1024 } },
    { name: 'wide tablet', viewport: { width: 820, height: 1024 } },
    { name: 'medium tablet', viewport: { width: 800, height: 1024 } },
    { name: 'tablet', viewport: { width: 768, height: 1024 } },
    { name: 'mobile', viewport: VRT_VIEWPORT_MOBILE },
    { name: 'small mobile', viewport: { width: 375, height: 1024 } },
    { name: 'narrow mobile', viewport: { width: 360, height: 1024 } },
    { name: 'smallest mobile', viewport: { width: 320, height: 1024 } },
  ])('keeps the seven slide dots and arrow stable on $name', async ({ viewport }) => {
    await preloadImages(['/images/landing-experience7.webp']);
    await renderForVRT(<LandingFreedomSection />, { viewport });
    const firstHeading = page.getByRole('heading', { name: 'Create without limits' });
    await expect.element(firstHeading).toBeVisible();
    const navigation = page.getByRole('group', { name: 'Slide navigation' }).element();
    const article = page.getByRole('article').element();
    const arrowButton = page.getByRole('button', { name: 'Next slide' });
    const initialCardBounds = article.getBoundingClientRect();
    const initialNavBounds = navigation.getBoundingClientRect();
    const initialArrowBounds = arrowButton.element().getBoundingClientRect();
    const image = article.querySelector('[style*="background-image"]')!;
    const initialImageBounds = image.getBoundingClientRect();
    expect(navigation.getBoundingClientRect().top).toBeGreaterThan(
      firstHeading.element().parentElement!.getBoundingClientRect().bottom,
    );

    const buttons = navigation.querySelectorAll('button');
    for (const button of buttons) {
      await page.elementLocator(button).click();
      const visibleHeading = page.getByRole('heading', { level: 3 });
      await expect.element(visibleHeading).toBeVisible();
      expect(button).toHaveAttribute('aria-current', 'true');
      expect(article.getBoundingClientRect().height).toBeCloseTo(initialCardBounds.height, 0);
      expect(navigation.getBoundingClientRect().top).toBeCloseTo(initialNavBounds.top, 0);
      expect(arrowButton.element().getBoundingClientRect().top).toBeCloseTo(initialArrowBounds.top, 0);
      expect(image.getBoundingClientRect().top).toBeCloseTo(initialImageBounds.top, 0);
      expect(navigation.getBoundingClientRect().top).toBeGreaterThan(
        visibleHeading.element().parentElement!.getBoundingClientRect().bottom,
      );
    }
    const heading = page.getByRole('heading', { name: 'Make a living' });
    await expect.element(heading).toBeVisible();
    await heading.hover();

    const dots = navigation.querySelectorAll('button > span');
    const arrow = arrowButton.element().getBoundingClientRect();
    expect(dots).toHaveLength(7);
    expect(dots[0].getBoundingClientRect().left).toBeCloseTo(heading.element().getBoundingClientRect().left, 0);

    dots.forEach((dot, index) => {
      const bounds = dot.getBoundingClientRect();
      const target = buttons[index].getBoundingClientRect();
      expect(target.width).toBeGreaterThanOrEqual(24);
      expect(target.height).toBeGreaterThanOrEqual(24);
      expect(bounds.left + bounds.width / 2).toBeCloseTo(target.left + target.width / 2, 0);
      expect(target.left).toBeGreaterThanOrEqual(initialCardBounds.left);
      expect(target.right).toBeLessThanOrEqual(initialCardBounds.right);
      if (viewport.width >= 768) {
        expect(bounds.top + bounds.height / 2).toBeCloseTo(arrow.top + arrow.height / 2, 0);
        expect(target.right).toBeLessThanOrEqual(arrow.left);
      }
      expect(getComputedStyle(dot).opacity).toBe(index === 6 ? '1' : '0.3');
    });
    if (viewport.width < 768) {
      const navigationBounds = navigation.getBoundingClientRect();
      const copyBounds = heading.element().parentElement!.getBoundingClientRect();
      expect(navigationBounds.top).toBeGreaterThan(copyBounds.bottom);
      expect(navigationBounds.bottom).toBeLessThanOrEqual(image.getBoundingClientRect().top);
      expect(article.getBoundingClientRect().bottom - arrow.bottom).toBeCloseTo(32, 0);
      expect(article.getBoundingClientRect().right - arrow.right).toBeCloseTo(32, 0);
    }
    expect(navigation.querySelector('[aria-current="true"]')).toHaveAccessibleName('Go to slide 7: Make a living');

    const restingColor = getComputedStyle(dots[6]).backgroundColor;
    await page.getByRole('button', { name: 'Go to slide 7: Make a living' }).hover();
    expect(getComputedStyle(dots[6]).backgroundColor).toBe(restingColor);
    expect(getComputedStyle(dots[6]).opacity).toBe('1');
    expect(getComputedStyle(dots[6]).scale).toBe('1.25');

    await page.getByRole('button', { name: 'Go to slide 6: Sell your content' }).hover();
    expect(getComputedStyle(dots[5]).backgroundColor).toBe(restingColor);
    expect(getComputedStyle(dots[5]).opacity).toBe('0.5');
    expect(getComputedStyle(dots[5]).scale).toBe('1.25');
    expect(getComputedStyle(dots[6]).opacity).toBe('1');
    await page.getByRole('button', { name: 'Go to slide 6: Sell your content' }).click();
    expect(getComputedStyle(dots[5]).opacity).toBe('1');
    expect(getComputedStyle(dots[6]).opacity).toBe('0.3');
  });

  it.each([
    { name: 'hero', Component: HomeFooter },
    { name: 'final section', Component: LandingFinalSection },
  ])('distinguishes the $name footer link without relying on colour or underlining', async ({ Component }) => {
    await renderForVRT(<Component />, { viewport: VRT_VIEWPORT_DESKTOP });
    const link = page.getByRole('link', { name: 'Pubky Protocol' });
    const linkStyle = getComputedStyle(link.element());
    const paragraphStyle = getComputedStyle(link.element().closest('p')!);

    expect(Number(linkStyle.fontWeight)).toBeGreaterThan(Number(paragraphStyle.fontWeight));
    expect(linkStyle.textDecorationLine).toBe('none');
    await link.hover();
    expect(getComputedStyle(link.element()).textDecorationLine).toBe('none');
  });
});
