// Preserve browser mock initialization order.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { cdp, page, server } from 'vitest/browser';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { DialogLocksAuth } from '@/organisms/DialogLocksAuth/DialogLocksAuth';

// Connecting keeps the Lock Server's cross-origin /connect page out of the capture.
vi.mock('@/hooks/useLocksAuthFlow/useLocksAuthFlow', () => ({
  useLocksAuthFlow: () => ({
    status: 'connecting',
    connectUrl: null,
    session: null,
    error: null,
    iframeRef: { current: null },
    prepare: vi.fn(),
    start: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePaykitSetupFlow/usePaykitSetupFlow', () => ({
  usePaykitSetupFlow: () => ({
    status: 'idle',
    setupUrl: null,
    error: null,
    iframeRef: { current: null },
    check: vi.fn(),
    start: vi.fn(),
    reset: vi.fn(),
  }),
}));

describe('DialogLocksAuth', () => {
  it('renders the Enable Locks step with the signer logos', async () => {
    await renderForVRT(<DialogLocksAuth open onOpenChange={vi.fn()} onSuccess={vi.fn()} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect.element(page.getByRole('dialog')).toBeVisible();
    await expect.element(page.getByRole('img', { name: 'Bitkit' })).toBeVisible();
    await matchVrtFrameScreenshot('locks-auth-enable-desktop');
  });

  // Same macOS Chromium limit as the Shop touch case: Linux Chromium CI cannot restore the fine pointer after CDP touch.
  it.skipIf(server.browser !== 'chromium' || server.platform !== 'darwin')(
    'renders the Enable Locks step with touch copy and no signer logos',
    async () => {
      const session = cdp();
      try {
        await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        await expect.poll(() => window.matchMedia('(pointer: coarse)').matches).toBe(true);
        await renderForVRT(<DialogLocksAuth open onOpenChange={vi.fn()} onSuccess={vi.fn()} />, {
          viewport: VRT_VIEWPORT_MOBILE,
        });
        await expect.element(page.getByRole('dialog')).toBeVisible();
        await expect.element(page.getByText('Use', { exact: true })).toBeVisible();
        await expect.element(page.getByRole('img', { name: 'Bitkit', includeHidden: true })).not.toBeVisible();
        await matchVrtFrameScreenshot('locks-auth-enable-mobile');
      } finally {
        await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
        await expect.poll(() => window.matchMedia('(pointer: fine)').matches).toBe(true);
        await expect.poll(() => window.matchMedia('(hover: hover)').matches).toBe(true);
      }
    },
  );
});
