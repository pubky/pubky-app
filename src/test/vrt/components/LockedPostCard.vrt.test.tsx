import { describe, expect, it, vi } from 'vitest';
import { LockedPostCard } from '@/molecules/LockedPostCard/LockedPostCard';
import { renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';

const LONG_TITLE = 'A very long lock title that keeps going well past the width of the card it sits in';

for (const viewport of [VRT_VIEWPORT_MOBILE, VRT_VIEWPORT_DESKTOP]) {
  describe(`LockedPostCard title pencil at ${viewport.width}px`, () => {
    const renderCard = async (value: string) => {
      const screen = await renderForVRT(
        <LockedPostCard price={{ amount: '1000', asset: 'BTC' }} editableTitle={{ value, onChange: vi.fn() }} />,
        { viewport },
      );
      const input = screen.getByRole('textbox', { name: 'Lock title' }).element();
      const pencil = screen.getByRole('button', { name: 'Edit lock title' }).element();
      const card = screen.getByTestId('locked-post-card').element();
      return { screen, input, pencil, card };
    };

    it.each([
      ['a short title', 'Short'],
      ['the default title while empty', ''],
    ])('sits right after %s', async (_, value) => {
      const { input, pencil } = await renderCard(value);
      const titleBox = input.parentElement;
      // The hidden copy of the title, which sizes the input.
      const mirror = titleBox?.querySelector('span');
      if (!titleBox || !mirror) throw new Error('The title input is not in its sizing box');
      const range = document.createRange();
      range.selectNodeContents(mirror);

      expect(Math.abs(titleBox.getBoundingClientRect().width - range.getBoundingClientRect().width)).toBeLessThan(2);
      // `gap-2`, give or take sub-pixel rounding.
      expect(pencil.getBoundingClientRect().left - titleBox.getBoundingClientRect().right).toBeCloseTo(8, 0);
    });

    it('puts the caret at the end of the title when the pencil starts editing', async () => {
      const { screen, input } = await renderCard('Short');
      if (!(input instanceof HTMLInputElement)) throw new Error('The lock title is not an input');

      await screen.getByRole('button', { name: 'Edit lock title' }).click();

      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe('Short'.length);
    });

    it('stays inside the card for a title longer than the card', async () => {
      const { pencil, card } = await renderCard(LONG_TITLE);

      expect(pencil.getBoundingClientRect().right).toBeLessThanOrEqual(card.getBoundingClientRect().right);
      expect(pencil.getBoundingClientRect().width).toBeGreaterThan(0);
    });
  });
}
