import { expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Checkbox } from '@/atoms/Checkbox/Checkbox';
import { HumanVerificationStatus } from '@/molecules/HumanVerificationStatus/HumanVerificationStatus';
import { contrastRatio, paintedHex } from '@/test-utils/color-contrast';
import { renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

it.each(['light', 'dark'] as const)('shows the default button focus ring on a %s card', async (theme) => {
  const screen = await renderForVRT(
    <main className="bg-card p-4">
      <input aria-label="Name" />
      <Button tabIndex={0}>Continue</Button>
    </main>,
    { viewport: VRT_VIEWPORT_DESKTOP, theme },
  );
  const button = screen.getByRole('button', { name: 'Continue' });
  await screen.getByRole('textbox').click();
  await userEvent.tab();
  await expect.element(button).toHaveFocus();
  expect(button.element().matches(':focus-visible')).toBe(true);

  const ringSize = '0px 0px 0px 3px';
  const shadows = getComputedStyle(button.element()).boxShadow.split(/,(?![^()]*\))/);
  const ring = shadows.find((shadow) => shadow.includes(ringSize));
  expect(ring).toBeDefined();
  const color = ring!.replace(ringSize, '').trim();
  expect(CSS.supports('color', color)).toBe(true);
  const card = getComputedStyle(screen.getByRole('main').element()).backgroundColor;
  expect(contrastRatio(paintedHex(card, color), paintedHex(card))).toBeGreaterThanOrEqual(3);
});

it.each(['light', 'dark'] as const)('uses the same readable ink on solid brand fills in %s mode', async (theme) => {
  const screen = await renderForVRT(
    <>
      <Button variant="brand">Continue</Button>
      <Badge>Member</Badge>
      <Checkbox aria-label="Accept" checked />
      <HumanVerificationStatus layout="desktop" method="phone" reason="geoblocked" />
    </>,
    { viewport: VRT_VIEWPORT_DESKTOP, theme },
  );

  const status = getComputedStyle(screen.getByRole('status').element());
  const checkbox = screen.getByRole('checkbox').element();
  const colors = [
    getComputedStyle(screen.getByRole('button', { name: 'Continue' }).element()).color,
    getComputedStyle(screen.getByText('Member').element()).color,
    getComputedStyle(checkbox.querySelector('svg')!).color,
  ];
  const ink = paintedHex(status.color);
  expect(ink).toBe(paintedHex(status.getPropertyValue(theme === 'dark' ? '--primary-foreground' : '--foreground')));
  for (const color of colors) expect(paintedHex(color)).toBe(ink);
  expect(contrastRatio(ink, paintedHex(status.backgroundColor))).toBeGreaterThanOrEqual(4.5);
});
