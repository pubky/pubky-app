import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { RepostHeader } from '@/molecules/RepostHeader/RepostHeader';
import { renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';

function HeaderStates() {
  return (
    <div data-testid="header-states" className="max-w-[840px] space-y-4 p-4 sm:p-6">
      <RepostHeader onUndo={vi.fn()} timeAgo="12m" />
      <RepostHeader isCollectionShare onUndo={vi.fn()} timeAgo="12m" />
      <RepostHeader isCollectionShare isUndoing onUndo={vi.fn()} timeAgo="12m" />
    </div>
  );
}

describe('RepostHeader — visual regression', () => {
  it('renders default, hover, focus, and pending states', async () => {
    await renderForVRT(<HeaderStates />, { viewport: VRT_VIEWPORT_DESKTOP });
    const headers = page.getByTestId('header-states');
    const undo = page.getByRole('button', { name: 'Undo', exact: true }).nth(1);
    const button = undo.element();
    const defaultBackground = getComputedStyle(button).backgroundColor;
    const defaultBorder = getComputedStyle(button).borderColor;
    await expect(headers).toMatchScreenshot('repost-header-default');

    await undo.hover();
    expect(getComputedStyle(button).backgroundColor).not.toBe(defaultBackground);
    expect(getComputedStyle(button).borderColor).toBe(defaultBorder);
    await expect(headers).toMatchScreenshot('repost-header-hover');

    await page.getByText('You reposted', { exact: true }).hover();
    // Establish keyboard modality, then focus explicitly: Safari's Tab order
    // depends on the host's full keyboard access setting.
    await userEvent.tab();
    button.focus();
    await expect.element(undo).toHaveFocus();
    await expect(headers).toMatchScreenshot('repost-header-focus');
  });

  it('keeps share wording, Undo, and timestamp visible on mobile', async () => {
    await renderForVRT(<HeaderStates />, { viewport: VRT_VIEWPORT_MOBILE });
    const headers = page.getByTestId('header-states');
    expect(headers.element().scrollWidth).toBeLessThanOrEqual(VRT_VIEWPORT_MOBILE.width);
    await expect(headers).toMatchScreenshot('repost-header-mobile');
  });
});
