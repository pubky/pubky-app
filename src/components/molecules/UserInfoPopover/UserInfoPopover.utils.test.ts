import { describe, expect, it } from 'vitest';
import { chooseStableVerticalSide } from './UserInfoPopover.utils';

describe('chooseStableVerticalSide', () => {
  it('chooses top when there is enough space above', () => {
    expect(
      chooseStableVerticalSide({
        triggerRect: { top: 420, bottom: 460 },
        estimatedPopoverHeight: 220,
        preferredSide: 'top',
        sideOffset: 1,
        viewportPaddingTop: 150,
        viewportPaddingBottom: 16,
        viewportHeight: 900,
      }),
    ).toBe('top');
  });

  it('chooses bottom when there is not enough space above but enough below', () => {
    expect(
      chooseStableVerticalSide({
        triggerRect: { top: 180, bottom: 220 },
        estimatedPopoverHeight: 220,
        preferredSide: 'top',
        sideOffset: 1,
        viewportPaddingTop: 150,
        viewportPaddingBottom: 16,
        viewportHeight: 900,
      }),
    ).toBe('bottom');
  });

  it('chooses the side with more usable space when neither side fits', () => {
    expect(
      chooseStableVerticalSide({
        triggerRect: { top: 380, bottom: 420 },
        estimatedPopoverHeight: 300,
        preferredSide: 'top',
        sideOffset: 1,
        viewportPaddingTop: 150,
        viewportPaddingBottom: 16,
        viewportHeight: 696,
      }),
    ).toBe('bottom');
  });

  it('keeps preferred top when both sides fit', () => {
    expect(
      chooseStableVerticalSide({
        triggerRect: { top: 500, bottom: 540 },
        estimatedPopoverHeight: 220,
        preferredSide: 'top',
        sideOffset: 1,
        viewportPaddingTop: 150,
        viewportPaddingBottom: 16,
        viewportHeight: 1000,
      }),
    ).toBe('top');
  });
});
