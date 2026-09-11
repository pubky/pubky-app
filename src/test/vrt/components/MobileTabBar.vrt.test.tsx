import { Circle } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { MobileTabBar } from '@/molecules/MobileTabBar/MobileTabBar';
import type { MobileTabBarItem } from '@/molecules/MobileTabBar/MobileTabBar.types';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';

const SUBPIXEL_TOLERANCE_PX = 1;

const items: MobileTabBarItem[] = Array.from({ length: 10 }, (_, index) => ({
  key: String(index),
  icon: Circle,
  label: `Tab ${index + 1}`,
  isActive: index === 9,
  onSelect: vi.fn(),
}));

describe('MobileTabBar scrolling', () => {
  it('brings an overflowing active tab into the scroll viewport', async () => {
    const screen = await renderForVRT(<MobileTabBar items={items} data-testid="mobile-tab-bar" />, {
      viewport: VRT_VIEWPORT_MOBILE,
    });
    const scroller = screen.getByTestId('mobile-tab-bar-scroll-container').element();
    const activeTab = screen.getByRole('button', { name: 'Tab 10' }).element();

    await vi.waitFor(() => {
      expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
      expect(scroller.scrollLeft).toBeGreaterThan(0);
    });

    // Browser layout rectangles can differ by a subpixel at scroll boundaries.
    expect(activeTab.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      scroller.getBoundingClientRect().left - SUBPIXEL_TOLERANCE_PX,
    );
    expect(activeTab.getBoundingClientRect().right).toBeLessThanOrEqual(
      scroller.getBoundingClientRect().right + SUBPIXEL_TOLERANCE_PX,
    );
  });

  it('realigns the active tab after switching from desktop to mobile', async () => {
    const screen = await renderForVRT(<MobileTabBar items={items} data-testid="mobile-tab-bar" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    const root = screen.getByTestId(VRT_ROOT_TESTID).element();
    const scroller = screen.getByTestId('mobile-tab-bar-scroll-container').element();

    root.style.width = `${VRT_VIEWPORT_MOBILE.width}px`;
    root.style.height = `${VRT_VIEWPORT_MOBILE.height}px`;
    await page.viewport(VRT_VIEWPORT_MOBILE.width, VRT_VIEWPORT_MOBILE.height);

    await vi.waitFor(() => {
      expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
      expect(scroller.scrollLeft).toBeGreaterThan(0);
    });
  });
});
