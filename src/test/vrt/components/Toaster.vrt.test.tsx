import { expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { toast } from '@/molecules/Toaster/toast';
import { Toaster } from '@/molecules/Toaster/Toaster';
import { contrastRatio } from '@/test-utils/color-contrast';
import { renderForVRT } from '@/test-utils/vrt';

// Canvas resolves CSS colours (including oklch and color-mix) and composites translucent layers in paint order.
function paintedHex(...layers: string[]): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d')!;
  for (const layer of layers) {
    context.fillStyle = layer;
    context.fillRect(0, 0, 1, 1);
  }
  return (
    '#' + Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3), (n) => n.toString(16).padStart(2, '0')).join('')
  );
}

it.each(['dark', 'light'] as const)(
  'keeps the success OK button readable at rest and on hover in %s mode',
  async (theme) => {
    const screen = await renderForVRT(
      <>
        <div className="fixed inset-0 bg-card" data-testid="backdrop" />
        <Toaster />
      </>,
      { viewport: { width: 800, height: 600 }, theme },
    );
    const handle = toast({ title: 'Collection order saved', dismissButton: true, persistent: true });
    try {
      const ok = page.getByRole('button', { name: 'OK', exact: true });
      await expect.element(ok).toBeVisible();
      const backdrop = getComputedStyle(screen.getByTestId('backdrop').element()).backgroundColor;
      const surface = getComputedStyle(ok.element().closest('[data-cy="toast"]')!).backgroundColor;
      const button = getComputedStyle(ok.element());
      const ratio = () =>
        contrastRatio(
          paintedHex(backdrop, surface, button.backgroundColor),
          paintedHex(backdrop, surface, button.backgroundColor, button.color),
        );
      expect(ratio()).toBeGreaterThanOrEqual(4.5);
      const idleFill = button.backgroundColor;
      await ok.hover();
      await expect.poll(() => button.backgroundColor).not.toBe(idleFill);
      expect(ratio()).toBeGreaterThanOrEqual(4.5);
      await ok.click();
      await expect.element(ok).not.toBeInTheDocument();
    } finally {
      handle.dismiss();
    }
  },
);
