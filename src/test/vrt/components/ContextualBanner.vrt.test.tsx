import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { ContextualBanner } from '@/molecules/ContextualBanner/ContextualBanner';
import type { ContextualBannerProps } from '@/molecules/ContextualBanner/ContextualBanner.types';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';

/**
 * Bar heights the "Pulse analytics" pill is lifted past while the banner shows
 * (`PILL_ABOVE_CONTEXTUAL_BANNER_CLASS` in `PulseConsent.tsx`) and the global scroll padding
 * keeps focus clear of (`globals.css`): the stacked card below `lg`, the single row on
 * landscape phones, the single row from `lg` (both also clear its 112px scrim there).
 * The banner must never grow past them.
 */
const MAX_MOBILE_HEIGHT_PX = 144;
const MAX_LANDSCAPE_HEIGHT_PX = 72;
const MAX_DESKTOP_HEIGHT_PX = 108;
const SUBPIXEL_TOLERANCE_PX = 1;
const DESKTOP_VIEWPORT_HEIGHT_PX = 900;

const BASE_PROPS: ContextualBannerProps = {
  headline: 'Get to know Satoshi Nakamoto',
  body: "Join Pubky to follow Satoshi Nakamoto and join the conversations they're part of.",
  joinHref: '/onboarding/join',
  signInHref: '/sign-in',
};

const LONG_COPY = {
  headline: 'Enjoying “Lightning: From Reckless to Reliable, the long road to self-custody”?',
  body: 'Join Pubky to reply to Satoshi Nakamoto, tag this article, and follow more of their writing. '.repeat(3),
};

function getBar() {
  const bar = page.getByTestId('contextual-banner').element().lastElementChild;
  if (!bar) throw new Error('ContextualBanner bar not rendered');
  return bar;
}

describe('ContextualBanner — visual regression', () => {
  it('renders the desktop bar with Continue with Google', async () => {
    await renderForVRT(<ContextualBanner {...BASE_PROPS} onContinueWithGoogle={vi.fn()} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect.element(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await matchVrtFrameScreenshot('contextual-banner-desktop');
  });

  it('renders the desktop bar without Continue with Google', async () => {
    await renderForVRT(<ContextualBanner {...BASE_PROPS} />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect.element(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await matchVrtFrameScreenshot('contextual-banner-desktop-no-google');
  });

  it('renders the mobile card with an icon-only Google button', async () => {
    await renderForVRT(<ContextualBanner {...BASE_PROPS} onContinueWithGoogle={vi.fn()} />, {
      viewport: VRT_VIEWPORT_MOBILE,
    });
    await expect.element(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await matchVrtFrameScreenshot('contextual-banner-mobile');
  });
});

describe('ContextualBanner — layout bounds', () => {
  it.each([320, 390, 768])('fits a %spx viewport and stays within the mobile height budget', async (width) => {
    await renderForVRT(<ContextualBanner {...BASE_PROPS} {...LONG_COPY} onContinueWithGoogle={vi.fn()} />, {
      viewport: { width, height: 844 },
    });
    const bar = getBar();
    await expect.element(page.getByRole('link', { name: 'Join Pubky' })).toBeVisible();
    await expect.element(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth);
    expect(bar.getBoundingClientRect().height).toBeLessThanOrEqual(MAX_MOBILE_HEIGHT_PX + SUBPIXEL_TOLERANCE_PX);
  });

  it.each([1024, 1440])('keeps one row within the desktop height budget at %spx', async (width) => {
    await renderForVRT(<ContextualBanner {...BASE_PROPS} {...LONG_COPY} onContinueWithGoogle={vi.fn()} />, {
      viewport: { width, height: DESKTOP_VIEWPORT_HEIGHT_PX },
    });
    const bar = getBar();
    const google = page.getByRole('button', { name: 'Continue with Google' }).element().getBoundingClientRect();
    const join = page.getByRole('link', { name: 'Join Pubky' }).element().getBoundingClientRect();
    expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth);
    expect(bar.getBoundingClientRect().height).toBeLessThanOrEqual(MAX_DESKTOP_HEIGHT_PX + SUBPIXEL_TOLERANCE_PX);
    // One row: the buttons share a line, and the bar sits flush with the viewport bottom.
    expect(Math.abs(google.top - join.top)).toBeLessThanOrEqual(SUBPIXEL_TOLERANCE_PX);
    expect(bar.getBoundingClientRect().bottom).toBeCloseTo(DESKTOP_VIEWPORT_HEIGHT_PX, 0);
  });

  it.each([
    [667, 375],
    [844, 390],
  ])('keeps one row within the landscape height budget at %sx%spx', async (width, height) => {
    await renderForVRT(<ContextualBanner {...BASE_PROPS} {...LONG_COPY} onContinueWithGoogle={vi.fn()} />, {
      viewport: { width, height },
    });
    const bar = getBar();
    await expect.element(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    const google = page.getByRole('button', { name: 'Continue with Google' }).element().getBoundingClientRect();
    const headline = page.getByText(LONG_COPY.headline).element().getBoundingClientRect();
    expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth);
    expect(bar.getBoundingClientRect().height).toBeLessThanOrEqual(MAX_LANDSCAPE_HEIGHT_PX + SUBPIXEL_TOLERANCE_PX);
    // One row: the copy and the actions sit side by side, not stacked.
    expect(google.left).toBeGreaterThan(headline.right);
  });

  it('lets clicks through the desktop scrim above the bar', async () => {
    await renderForVRT(<ContextualBanner {...BASE_PROPS} onContinueWithGoogle={vi.fn()} />, {
      viewport: { width: 1440, height: DESKTOP_VIEWPORT_HEIGHT_PX },
    });
    const banner = page.getByTestId('contextual-banner').element();
    const bar = getBar().getBoundingClientRect();
    const scrim = banner.firstElementChild?.getBoundingClientRect();
    expect(scrim?.height).toBeGreaterThan(0);
    // Middle of the scrim, which is part of the fixed section's box: the hit must land on the page.
    const hitAboveBar = document.elementFromPoint(bar.left + bar.width / 2, bar.top - 8);
    expect(banner.contains(hitAboveBar)).toBe(false);
    const hitOnBar = document.elementFromPoint(bar.left + 8, bar.top + bar.height / 2);
    expect(banner.contains(hitOnBar)).toBe(true);
  });

  it.each([
    [390, 844, '240px'],
    [844, 390, '160px'],
    [1440, DESKTOP_VIEWPORT_HEIGHT_PX, '224px'],
  ])('pads scroll targets past the banner at %sx%spx', async (width, height, padding) => {
    await renderForVRT(<ContextualBanner {...BASE_PROPS} />, { viewport: { width, height } });
    await expect.element(page.getByRole('link', { name: 'Join Pubky' })).toBeVisible();
    expect(getComputedStyle(document.documentElement).scrollPaddingBottom).toBe(padding);
  });
});
