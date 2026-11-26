import { describe, expect, it } from 'vitest';
import { Checkbox } from '@/atoms/Checkbox/Checkbox';
import { RadioGroup, RadioGroupItem } from '@/atoms/RadioGroup/RadioGroup';
import { contrastRatio, paintedHex } from '@/test-utils/color-contrast';
import { renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

describe.each(['bg-background', 'bg-card'])('Unchecked controls on %s', (surface) => {
  it.each(['light', 'dark'] as const)('keeps their borders visible in %s mode', async (theme) => {
    const screen = await renderForVRT(
      <main className={surface}>
        <Checkbox aria-label="Share location" />
        <RadioGroup aria-label="Location">
          <RadioGroupItem value="exact" label="Exact location" />
        </RadioGroup>
      </main>,
      { viewport: VRT_VIEWPORT_DESKTOP, theme },
    );

    const background = getComputedStyle(screen.getByRole('main').element()).backgroundColor;
    for (const role of ['checkbox', 'radio'] as const) {
      const control = screen.getByRole(role);
      await expect.element(control).not.toBeChecked();
      const border = getComputedStyle(control.element()).borderColor;
      expect(contrastRatio(paintedHex(background, border), paintedHex(background))).toBeGreaterThanOrEqual(3);
    }
  });
});
