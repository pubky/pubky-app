import { describe, expect, it } from 'vitest';
import { PubchiTierPanel } from '@/organisms/Pubchi/PubchiTierPanel/PubchiTierPanel';
import { matchVrtElementScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

const baseProps = {
  availableTiers: ['read-only', 'assisted'] as ('read-only' | 'assisted' | 'autonomous')[],
  autonomousDisabledReason: 'Autonomous publishing arrives after homeserver session revocation ships.',
  onChangeDesired: () => {},
};

describe('PubchiTierPanel — visual regression', () => {
  it('guards the production tier panel surface marker', async () => {
    const screen = await renderForVRT(
      <PubchiTierPanel {...baseProps} desiredTier="assisted" effectiveTier="assisted" />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );

    const surface = screen.getByTestId('pubchi-tier-panel');
    await expect.element(surface).toHaveAttribute('data-surface', 'pubchi-tier-panel');
  });

  it('captures the effective tier panel', async () => {
    const screen = await renderForVRT(
      <PubchiTierPanel {...baseProps} desiredTier="assisted" effectiveTier="assisted" />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );

    await matchVrtElementScreenshot(screen.getByTestId('pubchi-tier-panel'), 'pubchi-tier-panel-effective-desktop');
  });

  it('captures the lower effective tier alert', async () => {
    const screen = await renderForVRT(
      <PubchiTierPanel
        {...baseProps}
        desiredTier="assisted"
        effectiveTier="read-only"
        effectiveReason="Session lacks /pub/app.pubchi/v1/:rw"
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );

    await matchVrtElementScreenshot(
      screen.getByTestId('pubchi-tier-panel'),
      'pubchi-tier-panel-effective-lower-desktop',
    );
  });
});
