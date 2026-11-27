import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { DatabaseErrorScreen } from '@/molecules/DatabaseErrorScreen/DatabaseErrorScreen';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';

// The recovery screen with the copy DatabaseProvider passes when another tab
// runs a different DB_VERSION (VERSION_CONFLICT, D8). The provider replaces the
// whole app tree with it, header included, so it renders alone here too. The
// error-to-copy mapping is pinned in DatabaseProvider.test.tsx.
describe('DatabaseErrorScreen — version conflict — visual regression', () => {
  it.each([
    ['desktop', VRT_VIEWPORT_DESKTOP, 'dark'],
    ['mobile', VRT_VIEWPORT_MOBILE, 'dark'],
    ['light-desktop', VRT_VIEWPORT_DESKTOP, 'light'],
    ['light-mobile', VRT_VIEWPORT_MOBILE, 'light'],
  ] as const)('renders the conflict copy at %s', async (name, viewport, theme) => {
    await renderForVRT(<DatabaseErrorScreen onRetry={() => {}} description="Close other Pubky tabs, then retry." />, {
      viewport,
      theme,
    });
    await expect.element(page.getByRole('heading', { name: 'Storage unavailable' })).toBeVisible();
    await expect.element(page.getByText('Close other Pubky tabs, then retry.')).toBeVisible();
    await matchVrtFrameScreenshot(`database-error-version-conflict-${name}`);
  });
});
