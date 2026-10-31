// Preserve browser mock initialization order.
/* eslint-disable simple-import-sort/imports */
import type { Session as LocksSdkSession } from '@synonymdev/locks-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cdp, page, server } from 'vitest/browser';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE, VRT_VIEWPORT_NARROW } from '@/test-utils/vrt.viewports';
import { asOpaque } from '@/test-utils/type-assertions';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { DialogLocksAuth } from '@/organisms/DialogLocksAuth/DialogLocksAuth';

// Mutable so a case can put the Enable Payments step into the state it measures.
const paykit = vi.hoisted(() => ({
  status: 'idle' as string,
  mode: 'setup' as 'setup' | 'reconnect',
  error: null as unknown,
}));

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
    status: paykit.status,
    mode: paykit.mode,
    setupUrl: null,
    error: paykit.error,
    iframeRef: { current: null },
    check: vi.fn(),
    start: vi.fn(),
    reconnect: vi.fn(),
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

describe('DialogLocksAuth footer on the narrowest phone', () => {
  beforeEach(() => {
    paykit.status = 'idle';
    paykit.mode = 'setup';
    paykit.error = null;
    // A signed-in creator whose Paykit setup is still pending, so the dialog sits on Enable Payments.
    useLocksAuthStore.setState({
      ...locksAuthInitialState,
      session: asOpaque<LocksSdkSession>({ id: 'locks-session' }),
      locksSessionSecret: 'secret-abc',
      paykitConnected: false,
    });
  });

  it.each([
    ['a creator Paykit holds', 'reconnect-required', 'setup', 'Reconnect Bitkit'],
    ['a failed reconnect', 'error', 'reconnect', 'Reconnect Bitkit'],
    ['a failed setup', 'error', 'setup', 'Try again'],
  ] as const)('keeps both footer buttons inside a 320px dialog for %s', async (_name, status, mode, action) => {
    paykit.status = status;
    paykit.mode = mode;
    paykit.error = { message: 'Paykit reconnect failed: setup-failed' };
    await renderForVRT(<DialogLocksAuth open onOpenChange={vi.fn()} onSuccess={vi.fn()} />, {
      viewport: VRT_VIEWPORT_NARROW,
    });
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeVisible();
    await expect.element(page.getByRole('button', { name: action })).toBeVisible();

    const card = dialog.element();
    expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
    const cardBox = card.getBoundingClientRect();
    for (const name of ['Cancel', action]) {
      const box = page.getByRole('button', { name }).element().getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(cardBox.left);
      expect(box.right).toBeLessThanOrEqual(cardBox.right);
    }
  });
});
