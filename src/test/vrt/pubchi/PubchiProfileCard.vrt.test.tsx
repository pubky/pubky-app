import { describe, expect, it } from 'vitest';
import { PubchiProfileCard } from '@/organisms/Pubchi/PubchiProfileCard/PubchiProfileCard';
import { matchVrtElementScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

const bot = '9o6xw6h5r4n3m2k1j0hgfedcba987654321zyxwvutsrqpox444y';

describe('PubchiProfileCard — visual regression', () => {
  it('guards the production profile card surface marker', async () => {
    const screen = await renderForVRT(
      <PubchiProfileCard bot={bot} displayName="Research Pubchi" createdAt={1768454400} verified backupConfirmed />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    const surface = screen.getByTestId('pubchi-profile-card');
    await expect.element(surface).toHaveAttribute('data-surface', 'pubchi-profile-card');
  });

  it('captures the verified and backed-up profile card', async () => {
    const screen = await renderForVRT(
      <PubchiProfileCard bot={bot} displayName="Research Pubchi" createdAt={1768454400} verified backupConfirmed />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await matchVrtElementScreenshot(
      screen.getByTestId('pubchi-profile-card'),
      'pubchi-profile-card-verified-backed-up-desktop',
    );
  });

  it('captures the unverified and not-backed-up profile card', async () => {
    const screen = await renderForVRT(
      <PubchiProfileCard
        bot={bot}
        displayName="Research Pubchi"
        createdAt={1768454400}
        verified={false}
        backupConfirmed={false}
        onBackup={() => {}}
        onRemove={() => {}}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await matchVrtElementScreenshot(
      screen.getByTestId('pubchi-profile-card'),
      'pubchi-profile-card-unverified-not-backed-up-desktop',
    );
  });
});
