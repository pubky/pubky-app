import { describe, expect, it, vi } from 'vitest';
import { InputField } from '@/molecules/InputField/InputField';
import { contrastRatio, paintedHex } from '@/test-utils/color-contrast';
import { renderForVRT } from '@/test-utils/vrt';

for (const width of [390, 1440]) {
  describe(`InputField mouse target at ${width}px`, () => {
    const viewport = { width, height: 844 };

    it('focuses the input when clicking its top and bottom padding', async () => {
      const screen = await renderForVRT(<InputField value="Profile name" onChange={vi.fn()} />, { viewport });
      const input = screen.getByRole('textbox');
      const field = screen.getByTestId('container');
      const bounds = field.element().getBoundingClientRect();
      const idleBorder = getComputedStyle(field.element()).borderColor;

      for (const y of [10, bounds.height - 10]) {
        await field.click({ position: { x: bounds.width / 2, y } });
        expect(document.activeElement).toBe(input.element());
        expect(getComputedStyle(field.element()).borderColor).not.toBe(idleBorder);
        input.element().blur();
      }
    });

    it('invokes a read-only input action once from either padded edge', async () => {
      const onClick = vi.fn();
      const screen = await renderForVRT(<InputField value="Public key" readOnly onClick={onClick} />, { viewport });
      const field = screen.getByTestId('container');
      const bounds = field.element().getBoundingClientRect();

      for (const y of [10, bounds.height - 10]) {
        onClick.mockClear();
        await field.click({ position: { x: bounds.width / 2, y } });
        expect(onClick).toHaveBeenCalledTimes(1);
      }
    });

    it.each(['disabled', 'loading'] as const)('keeps the padded input inert when %s', async (state) => {
      const onClick = vi.fn();
      const screen = await renderForVRT(
        <InputField
          value="Public key"
          readOnly
          onClick={onClick}
          disabled={state === 'disabled'}
          loading={state === 'loading'}
        />,
        { viewport },
      );
      const input = screen.getByRole('textbox');
      const field = screen.getByTestId('container').first();
      const bounds = field.element().getBoundingClientRect();

      for (const y of [10, bounds.height - 10]) {
        await field.click({ position: { x: bounds.width / 2, y } });
        expect(document.activeElement).not.toBe(input.element());
        expect(onClick).not.toHaveBeenCalled();
      }
    });

    it('keeps the icon action separate from the input action', async () => {
      const onClick = vi.fn();
      const onClickIcon = vi.fn();
      const screen = await renderForVRT(
        <InputField
          value="Link"
          readOnly
          onClick={onClick}
          icon={<span>Paste</span>}
          iconPosition="right"
          onClickIcon={onClickIcon}
          iconAriaLabel="Paste"
        />,
        { viewport },
      );

      await screen.getByRole('button', { name: 'Paste' }).click();
      expect(onClickIcon).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    });
  });
}

it('keeps the profile error message readable on a dark card', async () => {
  const screen = await renderForVRT(
    <main className="bg-card p-4">
      <InputField id="name" value="" readOnly status="error" messageType="error" message="Enter your name" />
    </main>,
    { viewport: { width: 390, height: 844 }, theme: 'dark' },
  );
  const message = screen.getByRole('alert');
  await expect.element(message).toBeVisible();
  const card = getComputedStyle(screen.getByRole('main').element()).backgroundColor;
  const ink = getComputedStyle(message.element()).color;
  expect(contrastRatio(paintedHex(card, ink), paintedHex(card))).toBeGreaterThanOrEqual(4.5);
});
