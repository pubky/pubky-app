import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cdp, server, userEvent } from 'vitest/browser';
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

const fields = [
  ['Name', InputField],
  ['Bio', TextareaField],
] as const;

describe.skipIf(server.browser !== 'chromium')('field focus in forced colors', () => {
  beforeEach(async () => {
    await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    expect(window.matchMedia('(forced-colors: active)').matches).toBe(true);
  });

  afterEach(async () => {
    await cdp().send('Emulation.setEmulatedMedia', { features: [] });
  });

  for (const [name, Field] of fields) {
    it.each(['default', 'error', 'success'] as const)(
      `outlines ${name} when tabbing into the %s field`,
      async (status) => {
        const screen = await renderForVRT(
          <main>
            <button type="button">Previous field</button>
            <Field value="Example" readOnly status={status} />
          </main>,
          { viewport: { width: 390, height: 844 } },
        );
        const wrapper = screen.getByTestId('container').element();
        await screen.getByRole('button', { name: 'Previous field' }).click();
        expect(getComputedStyle(wrapper).outlineStyle).toBe('none');
        await userEvent.tab();
        await expect.element(screen.getByRole('textbox')).toHaveFocus();
        const style = getComputedStyle(wrapper);
        expect(style.outlineStyle).toBe('solid');
        expect(parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(2);
      },
    );
  }

  it('distinguishes the focused icon action from the focused field', async () => {
    const screen = await renderForVRT(
      <InputField
        value="Link"
        readOnly
        icon={<span>Paste</span>}
        iconPosition="right"
        iconAriaLabel="Paste"
        onClickIcon={vi.fn()}
      />,
      { viewport: { width: 390, height: 844 } },
    );
    const input = screen.getByRole('textbox');
    const action = screen.getByRole('button', { name: 'Paste' });
    await input.click();
    await expect.element(input).toHaveFocus();
    expect(getComputedStyle(action.element()).outlineStyle).toBe('none');
    await userEvent.tab();
    await expect.element(action).toHaveFocus();
    const style = getComputedStyle(action.element());
    expect(style.outlineStyle).toBe('solid');
    expect(parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(2);
  });
});

for (const [name, Field] of fields) {
  describe.each(['dark', 'light'] as const)(`${name} in %s mode`, (theme) => {
    describe.each(['bg-background', 'bg-card'])('on %s', (surface) => {
      it.each(['default', 'error', 'success'] as const)('shows keyboard focus for the %s state', async (status) => {
        const screen = await renderForVRT(
          <main className={`p-4 ${surface}`}>
            <button type="button">Previous field</button>
            <Field
              value="Example"
              readOnly
              variant="dashed"
              status={status}
              messageType={status === 'error' ? 'error' : undefined}
              message={status === 'error' ? 'Check this field' : undefined}
            />
          </main>,
          { viewport: { width: 390, height: 844 }, theme },
        );
        const input = screen.getByRole('textbox');
        const wrapper = screen.getByTestId('container').element();
        const idleBorder = getComputedStyle(wrapper).borderColor;
        const ringSize = '0px 0px 0px 3px';
        expect(getComputedStyle(wrapper).boxShadow).not.toContain(ringSize);
        await screen.getByRole('button', { name: 'Previous field' }).click();
        await userEvent.tab();
        await expect.element(input).toHaveFocus();

        const background = getComputedStyle(screen.getByRole('main').element()).backgroundColor;
        const surfaceColor = paintedHex(background);
        const style = getComputedStyle(wrapper);
        const borderToken = { default: '--ring', error: '--destructive', success: '--brand' }[status];
        expect(paintedHex(style.borderColor)).toBe(paintedHex(style.getPropertyValue(borderToken)));
        const ring = style.boxShadow.split(/,(?![^()]*\))/).find((shadow) => shadow.includes(ringSize));
        expect(ring).toBeDefined();
        const ringColor = ring!.replace(ringSize, '').trim();
        expect(CSS.supports('color', ringColor)).toBe(true);
        const paintedRing = paintedHex(background, ringColor);
        if (status === 'default') {
          const ringToken = style.getPropertyValue('--ring');
          expect(paintedRing).toBe(paintedHex(background, `color-mix(in oklab, ${ringToken} 50%, transparent)`));
        } else {
          expect(style.borderColor).toBe(idleBorder);
          expect(paintedRing).toBe(paintedHex(background, style.getPropertyValue('--ring')));
          expect(contrastRatio(paintedRing, surfaceColor)).toBeGreaterThanOrEqual(3);
        }
        if (status !== 'success') {
          expect(contrastRatio(paintedHex(style.borderColor), surfaceColor)).toBeGreaterThanOrEqual(3);
        }
        if (status === 'error') {
          const message = screen.getByText('Check this field');
          await expect.element(message).toBeVisible();
          expect(
            contrastRatio(surfaceColor, paintedHex(background, getComputedStyle(message.element()).color)),
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    });
  });
}
