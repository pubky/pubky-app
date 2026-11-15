import { describe, expect, it, vi } from 'vitest';
import { PubchiPreferencesForm } from '@/organisms/Pubchi/PubchiPreferencesForm/PubchiPreferencesForm';
import { matchVrtElementScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    loadPubchiConfig: vi.fn().mockResolvedValue(null),
    savePubchiConfig: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('PubchiPreferencesForm — visual regression', () => {
  it('guards the production preferences surface marker', async () => {
    const screen = await renderForVRT(<PubchiPreferencesForm />, { viewport: VRT_VIEWPORT_DESKTOP });
    const surface = screen.getByTestId('pubchi-preferences');
    await expect.element(surface).toHaveAttribute('data-surface', 'pubchi-preferences');
  });

  it('captures the preferences form surface only', async () => {
    const screen = await renderForVRT(<PubchiPreferencesForm />, { viewport: VRT_VIEWPORT_DESKTOP });
    await matchVrtElementScreenshot(screen.getByTestId('pubchi-preferences'), 'pubchi-preferences-desktop');
  });
});
