// Intentional import order — vi.hoisted + vi.mock factories rely on stable
// Vitest `__vi_import_N__` aliases; reordering causes a TDZ crash in
// @vitest/browser. Do not let `eslint --fix` reorder these imports.
/* eslint-disable simple-import-sort/imports */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { matchVrtFrameScreenshot, preloadImages, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { createZustandLikeHook } from '@/test-utils/stores';
import { Header } from '@/organisms/Header/Header';
import { Landing } from '@/templates/Public/Landing/Landing';
import { LandingFinalSection } from '@/templates/Public/Landing/LandingFinalSection';
import { LandingFreedomSection } from '@/templates/Public/Landing/LandingFreedomSection';
import { HomeFooter } from '@/molecules/Home/Home';
import { LandingBrokenSection } from '@/templates/Public/Landing/LandingBrokenSection';

const mockAppleEnabled = vi.hoisted(() => vi.fn(() => false));
beforeEach(() => mockAppleEnabled.mockReturnValue(false));

const HERO_ASSETS = [
  '/pubky-logo.svg',
  '/images/synonym-grey-logo.svg',
  '/images/a-tether-company.svg',
  '/images/bg-home.svg',
];
const DESKTOP_HERO_ASSETS = [...HERO_ASSETS, '/images/landing-video-poster.webp'];

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

// Capture the real responsive poster while keeping movie frames deterministic.
vi.mock('@/templates/Public/Landing/LandingVideo.constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/templates/Public/Landing/LandingVideo.constants')>()),
  LANDING_VIDEO_QUERY: 'not all',
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
    await preloadImages(DESKTOP_HERO_ASSETS);
    await renderForVRT(<LandingWithHeader />, { viewport: VRT_VIEWPORT_DESKTOP });
    // Viewport-clamped root: first fold only (hero is min-h-svh; lower
    // sections are intentionally cropped — see docs/visual-regression-testing.md).
    await matchVrtFrameScreenshot('landing-desktop');
  });

  it('renders the landing hero at mobile viewport', async () => {
    await preloadImages(HERO_ASSETS);
    await renderForVRT(<LandingWithHeader />, { viewport: VRT_VIEWPORT_MOBILE });
    await matchVrtFrameScreenshot('landing-mobile');
  });

  it.each([
    ['desktop', VRT_VIEWPORT_DESKTOP],
    ['mobile', VRT_VIEWPORT_MOBILE],
  ] as const)('renders the Apple-enabled hero on %s', async (name, viewport) => {
    mockAppleEnabled.mockReturnValue(true);
    await preloadImages(name === 'desktop' ? DESKTOP_HERO_ASSETS : HERO_ASSETS);
    await renderForVRT(<LandingWithHeader />, { viewport });
    await expect.element(page.getByRole('button', { name: 'Continue with Google or Apple' }).first()).toBeVisible();
    await matchVrtFrameScreenshot(`landing-apple-enabled-${name}`);
  });

  it('reveals the card description on keyboard focus with motion disabled and dismisses it after a pointer click', async () => {
    await renderForVRT(<LandingBrokenSection />, { viewport: VRT_VIEWPORT_DESKTOP });
    const heading = page.getByRole('heading', { level: 2 });
    const poster = page.getByRole('img', { name: 'They own you' });
    const description = document.getElementById(poster.element().getAttribute('aria-describedby')!)!;
    await heading.click();
    await userEvent.tab();
    await expect.element(poster).toHaveFocus();
    expect(getComputedStyle(description).opacity).toBe('1');
    expect(poster.element().closest('article')?.querySelector('video')).toBeNull();

    await poster.click();
    await heading.hover();
    await expect.poll(() => getComputedStyle(description).opacity).toBe('0');
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
    await renderForVRT(<LandingFreedomSection />, { viewport });
    const firstHeading = page.getByRole('heading', { name: 'Create without limits' });
    await expect.element(firstHeading).toBeVisible();
    const navigation = page.getByRole('group', { name: 'Slide navigation' }).element();
    const article = page.getByRole('article').element();
    const arrowButton = page.getByRole('button', { name: 'Next slide' });
    const initialCardBounds = article.getBoundingClientRect();
    const initialNavBounds = navigation.getBoundingClientRect();
    const initialArrowBounds = arrowButton.element().getBoundingClientRect();
    const paintedArtwork = () => article.querySelector<HTMLImageElement>('img.opacity-100');
    await expect.poll(() => paintedArtwork()?.naturalWidth).toBeGreaterThan(0);
    const initialImageBounds = paintedArtwork()!.getBoundingClientRect();
    expect(navigation.getBoundingClientRect().top).toBeGreaterThan(
      firstHeading.element().parentElement!.getBoundingClientRect().bottom,
    );

    const buttons = navigation.querySelectorAll('button');
    for (const [index, button] of buttons.entries()) {
      await page.elementLocator(button).click();
      const visibleHeading = page.getByRole('heading', { level: 3 });
      await expect.element(visibleHeading).toBeVisible();
      expect(button).toHaveAttribute('aria-current', 'true');
      expect(article.getBoundingClientRect().height).toBeCloseTo(initialCardBounds.height, 0);
      expect(navigation.getBoundingClientRect().top).toBeCloseTo(initialNavBounds.top, 0);
      expect(arrowButton.element().getBoundingClientRect().top).toBeCloseTo(initialArrowBounds.top, 0);
      await expect.poll(() => paintedArtwork()?.currentSrc).toContain(`landing-experience${index + 1}.`);
      expect(paintedArtwork()!.getBoundingClientRect().top).toBeCloseTo(initialImageBounds.top, 0);
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
      expect(navigationBounds.bottom).toBeLessThanOrEqual(paintedArtwork()!.getBoundingClientRect().top);
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

// Match the default deployment, with explicit Apple-enabled coverage above.
vi.mock('@/config/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/network')>()),
  isPassportAppleEnabled: mockAppleEnabled,
}));
