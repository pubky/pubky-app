'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_STABLE_POPOVER_VIEWPORT_PADDING,
  STABLE_POPOVER_ESTIMATED_HEIGHT,
} from './useStablePopoverPlacement.constants';
import { chooseStableVerticalSide, type StableVerticalPopoverSide } from './useStablePopoverPlacement.utils';

interface UseStablePopoverPlacementOptions {
  enabled: boolean;
  open: boolean;
  preferredSide?: StableVerticalPopoverSide;
  triggerRef?: React.RefObject<HTMLElement | null>;
  sideOffset?: number;
  viewportPadding?: {
    top: number;
    bottom: number;
  };
}

interface UseStablePopoverPlacementResult {
  side: StableVerticalPopoverSide;
  contentRef: React.RefObject<HTMLDivElement | null>;
  resolve: () => void;
}

export function useStablePopoverPlacement({
  enabled,
  open,
  preferredSide = 'top',
  triggerRef,
  sideOffset = 0,
  viewportPadding = DEFAULT_STABLE_POPOVER_VIEWPORT_PADDING,
}: UseStablePopoverPlacementOptions): UseStablePopoverPlacementResult {
  const [resolvedSide, setResolvedSide] = useState<StableVerticalPopoverSide>(preferredSide);
  const contentRef = useRef<HTMLDivElement>(null);
  const measuredHeightRef = useRef(STABLE_POPOVER_ESTIMATED_HEIGHT);

  const resolve = () => {
    if (!enabled) {
      return;
    }

    const triggerElement = triggerRef?.current;

    if (!triggerElement) {
      setResolvedSide(preferredSide);
      return;
    }

    setResolvedSide(
      chooseStableVerticalSide({
        triggerRect: triggerElement.getBoundingClientRect(),
        estimatedPopoverHeight: measuredHeightRef.current,
        preferredSide,
        sideOffset,
        viewportPaddingTop: viewportPadding.top,
        viewportPaddingBottom: viewportPadding.bottom,
        viewportHeight: window.innerHeight,
      }),
    );
  };

  useEffect(() => {
    if (!enabled || !open || !contentRef.current) {
      return;
    }

    const updateMeasuredHeight = () => {
      const contentHeight = Math.ceil(contentRef.current?.getBoundingClientRect().height ?? 0);
      if (contentHeight > 0) {
        measuredHeightRef.current = contentHeight;
      }
    };

    updateMeasuredHeight();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateMeasuredHeight();
    });

    resizeObserver.observe(contentRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [enabled, open]);

  return {
    side: resolvedSide,
    contentRef,
    resolve,
  };
}
