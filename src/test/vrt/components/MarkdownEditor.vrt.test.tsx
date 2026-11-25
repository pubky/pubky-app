import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { MarkdownEditor } from '@/molecules/MarkdownEditor/MarkdownEditor';
import { contrastRatio, paintedHex } from '@/test-utils/color-contrast';
import { renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

it('keeps the link dialog Save label readable in light mode', async () => {
  await renderForVRT(<MarkdownEditor markdown="Add a link here." />, {
    viewport: VRT_VIEWPORT_DESKTOP,
    theme: 'light',
  });
  await page.getByText('Add a link here.').click();
  await page.getByRole('button', { name: 'Create link' }).click();
  const save = page.getByRole('button', { name: 'Set URL' });
  await expect.element(save).toBeVisible();

  const style = getComputedStyle(save.element());
  expect(contrastRatio(paintedHex(style.color), paintedHex(style.backgroundColor))).toBeGreaterThanOrEqual(4.5);
});
