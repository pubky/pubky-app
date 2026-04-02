export type StableVerticalPopoverSide = 'top' | 'bottom';

interface ChooseStableVerticalSideParams {
  triggerRect: Pick<DOMRect, 'top' | 'bottom'>;
  estimatedPopoverHeight: number;
  preferredSide: StableVerticalPopoverSide;
  sideOffset: number;
  viewportPaddingTop: number;
  viewportPaddingBottom: number;
  viewportHeight: number;
}

function getOppositeSide(side: StableVerticalPopoverSide): StableVerticalPopoverSide {
  return side === 'top' ? 'bottom' : 'top';
}

export function chooseStableVerticalSide({
  triggerRect,
  estimatedPopoverHeight,
  preferredSide,
  sideOffset,
  viewportPaddingTop,
  viewportPaddingBottom,
  viewportHeight,
}: ChooseStableVerticalSideParams): StableVerticalPopoverSide {
  const usableSpaceAbove = triggerRect.top - viewportPaddingTop;
  const usableSpaceBelow = viewportHeight - triggerRect.bottom - viewportPaddingBottom;
  const requiredSpace = estimatedPopoverHeight + sideOffset;
  const preferredUsableSpace = preferredSide === 'top' ? usableSpaceAbove : usableSpaceBelow;
  const oppositeSide = getOppositeSide(preferredSide);
  const oppositeUsableSpace = oppositeSide === 'top' ? usableSpaceAbove : usableSpaceBelow;

  if (preferredUsableSpace >= requiredSpace) {
    return preferredSide;
  }

  if (oppositeUsableSpace >= requiredSpace) {
    return oppositeSide;
  }

  return usableSpaceAbove >= usableSpaceBelow ? 'top' : 'bottom';
}
