import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { InputField } from '@/molecules/InputField/InputField';
import { TextareaField } from '@/molecules/TextareaField/TextareaField';
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

for (const [name, Field] of [
  ['Name', InputField],
  ['Bio', TextareaField],
] as const) {
  describe(name, () => {
    for (const theme of ['dark', 'light'] as const) {
      it.each(['default', 'error'] as const)(`shows the %s focus ring on a ${theme} card`, async (status) => {
        const error = status === 'error';
        const screen = await renderForVRT(
          <main style={{ backgroundColor: 'var(--card)' }}>
            <button type="button">Previous field</button>
            <Field
              value="Example"
              readOnly
              status={status}
              messageType="error"
              message={error ? 'Check this field' : undefined}
            />
          </main>,
          { viewport: { width: 390, height: 844 }, theme },
        );
        const input = screen.getByRole('textbox');
        const wrapper = screen.getByTestId('container').element();
        const ringSize = '0px 0px 0px 3px';
        expect(getComputedStyle(wrapper).boxShadow).not.toContain(ringSize);
        await screen.getByRole('button', { name: 'Previous field' }).click();
        await userEvent.tab();
        await expect.element(input).toHaveFocus();

        const surface = getComputedStyle(screen.getByRole('main').element()).backgroundColor;
        const style = getComputedStyle(wrapper);
        const border = style.getPropertyValue(error ? '--destructive' : '--ring');
        const errorOpacity = theme === 'dark' ? 40 : 20;
        expect(paintedHex(style.borderColor)).toBe(paintedHex(border));
        expect(contrastRatio(paintedHex(style.borderColor), paintedHex(surface))).toBeGreaterThanOrEqual(3);
        const ring = style.boxShadow.split(/,(?![^()]*\))/).find((shadow) => shadow.includes(ringSize));
        expect(ring).toBeDefined();
        const ringColor = ring!.replace(ringSize, '').trim();
        expect(paintedHex(surface, ringColor)).toBe(
          paintedHex(surface, `color-mix(in oklab, ${border} ${error ? errorOpacity : 50}%, transparent)`),
        );
        if (error) {
          const message = screen.getByText('Check this field');
          await expect.element(message).toBeVisible();
          expect(
            contrastRatio(paintedHex(surface), paintedHex(surface, getComputedStyle(message.element()).color)),
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  });
}
