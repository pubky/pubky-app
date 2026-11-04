import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { Container } from '@/atoms/Container/Container';
import { PostInputActionBar } from '@/organisms/PostInputActionBar/PostInputActionBar';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import type { VrtViewport } from '@/test-utils/vrt.viewports';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';

// The popover opens above its trigger, so the bar sits low enough for it to keep that side.
async function renderWithLockHelpOpen(viewport: VrtViewport) {
  await renderForVRT(
    <Container overrideDefaults className="px-6 pt-40">
      <PostInputActionBar
        onEmojiClick={vi.fn()}
        onImageClick={vi.fn()}
        onArticleClick={vi.fn()}
        onPostClick={vi.fn()}
        isPostDisabled
        hideArticleButton={false}
        lockSwitch={{ checked: false, onCheckedChange: vi.fn(), showHelp: true }}
      />
    </Container>,
    { viewport },
  );
  await page.getByRole('button', { name: 'Sell your content' }).click();
  await expect
    .element(
      page.getByText('Let people pay to unlock the value you create. Add content first, then switch on the lock.'),
    )
    .toBeVisible();
}

describe('PostInputActionBar — lock help', () => {
  it('renders the lock help popover open on desktop', async () => {
    await renderWithLockHelpOpen(VRT_VIEWPORT_DESKTOP);
    await matchVrtFrameScreenshot('lock-help-open-desktop');
  });

  it('renders the lock help popover open on mobile', async () => {
    await renderWithLockHelpOpen(VRT_VIEWPORT_MOBILE);
    await matchVrtFrameScreenshot('lock-help-open-mobile');
  });
});
