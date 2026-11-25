import { describe, expect, it } from 'vitest';
import { toast } from '@/molecules/Toaster/toast';
import { Toaster } from '@/molecules/Toaster/Toaster';
import { contrastRatio, paintedHex } from '@/test-utils/color-contrast';
import { renderForVRT } from '@/test-utils/vrt';

function expectReadable(element: Element, surface: string) {
  const style = getComputedStyle(element);
  const fill = paintedHex(surface, style.backgroundColor);
  expect(contrastRatio(paintedHex(fill, style.color), fill)).toBeGreaterThanOrEqual(4.5);
}

describe.each(['var(--card)', '#000', '#606060', '#fff'])('Success toast over %s', (backdrop) => {
  it.each(['dark', 'light'] as const)('keeps its text and OK button readable in %s mode', async (theme) => {
    const screen = await renderForVRT(
      <main className="fixed inset-0" style={{ backgroundColor: backdrop }}>
        <Toaster />
      </main>,
      { viewport: { width: 800, height: 600 }, theme },
    );
    const handle = toast({
      title: 'Collection order saved',
      description: 'Changes saved.',
      dismissButton: true,
      persistent: true,
    });
    try {
      const title = screen.getByText('Collection order saved', { exact: true });
      const description = screen.getByText('Changes saved.', { exact: true });
      const ok = screen.getByRole('button', { name: 'OK', exact: true });
      await expect.element(ok).toBeVisible();
      const surface = paintedHex(
        getComputedStyle(screen.getByRole('main').element()).backgroundColor,
        getComputedStyle(ok.element().closest('[data-cy="toast"]')!).backgroundColor,
      );
      expectReadable(title.element(), surface);
      expectReadable(description.element(), surface);
      await title.hover();
      expectReadable(ok.element(), surface);
      const idleFill = getComputedStyle(ok.element()).backgroundColor;
      await ok.hover();
      await expect.poll(() => getComputedStyle(ok.element()).backgroundColor).not.toBe(idleFill);
      expectReadable(ok.element(), surface);
      await ok.click();
      await expect.element(ok).not.toBeInTheDocument();
    } finally {
      handle.dismiss();
    }
  });
});
