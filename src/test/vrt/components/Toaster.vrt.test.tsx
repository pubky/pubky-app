import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { toast } from '@/molecules/Toaster/toast';
import { Toaster } from '@/molecules/Toaster/Toaster';
import { contrastRatio, paintedHex } from '@/test-utils/color-contrast';
import { renderForVRT } from '@/test-utils/vrt';

function expectReadable(element: Element, surface: string) {
  const style = getComputedStyle(element);
  // The button's hover gradient paints the same translucent colour at both stops.
  const hoverWash = style.backgroundImage.match(/^linear-gradient\((.+), \1\)$/)?.[1];
  const fill = paintedHex(surface, style.backgroundColor, ...(hoverWash ? [hoverWash] : []));
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
      const idle = getComputedStyle(ok.element());
      expect(idle.paddingLeft).toBe('14px');
      expect(idle.paddingRight).toBe('14px');
      expect(idle.fontSize).toBe('12px');
      expect(idle.lineHeight).toBe('16px');
      const idleFill = idle.backgroundColor;
      await ok.hover();
      await expect.poll(() => getComputedStyle(ok.element()).backgroundColor).not.toBe(idleFill);
      expect(getComputedStyle(ok.element()).backgroundImage).toMatch(/^linear-gradient/);
      expectReadable(ok.element(), surface);
      await ok.click();
      await expect.element(ok).not.toBeInTheDocument();
    } finally {
      handle.dismiss();
    }
  });
});

it.each(['dark', 'light'] as const)('shows keyboard focus on OK against the %s success surface', async (theme) => {
  const screen = await renderForVRT(<Toaster />, { viewport: { width: 800, height: 600 }, theme });
  const handle = toast({ title: 'Saved', dismissButton: true, persistent: true });
  try {
    const ok = screen.getByRole('button', { name: 'OK' });
    await expect.element(ok).toBeVisible();
    await screen.getByText('Saved', { exact: true }).click();
    await userEvent.keyboard('{F8}');
    await userEvent.tab();
    await userEvent.tab();
    await expect.element(ok).toHaveFocus();
    const style = getComputedStyle(ok.element());
    const surface = getComputedStyle(ok.element().closest('[data-cy="toast"]')!).backgroundColor;
    expect(style.boxShadow).toContain('0px 0px 0px 3px');
    const ring = style.getPropertyValue('--tw-ring-color');
    expect(CSS.supports('color', ring)).toBe(true);
    expect(contrastRatio(paintedHex(surface, ring), paintedHex(surface))).toBeGreaterThanOrEqual(3);
    expectReadable(ok.element(), surface);
  } finally {
    handle.dismiss();
  }
});

describe.each([
  ['default', 'Undo'],
  ['error', 'Retry'],
] as const)('%s toast action', (variant, label) => {
  it.each(['dark', 'light'] as const)('shows keyboard focus on a neutral button in %s mode', async (theme) => {
    const screen = await renderForVRT(
      <main className="fixed inset-0" style={{ backgroundColor: '#606060' }}>
        <Toaster />
      </main>,
      { viewport: { width: 800, height: 600 }, theme },
    );
    const handle = toast({
      title: 'Item updated',
      variant,
      persistent: true,
      action: { label, altText: label, onClick: () => {} },
    });
    try {
      const action = screen.getByRole('button', { name: label });
      await expect.element(action).toBeVisible();
      await screen.getByText('Item updated', { exact: true }).click();
      await userEvent.keyboard('{F8}');
      await userEvent.tab();
      await userEvent.tab();
      await expect.element(action).toHaveFocus();
      const style = getComputedStyle(action.element());
      expect(style.outlineStyle).toBe('solid');
      expect(style.outlineWidth).toBe('2px');
      expect(style.outlineOffset).toBe('-2px');
      const fill = paintedHex(style.backgroundColor);
      expect(contrastRatio(paintedHex(fill, style.outlineColor), fill)).toBeGreaterThanOrEqual(3);
    } finally {
      handle.dismiss();
    }
  });
});
