'use client';

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type {
  UseElementKeyboardAvoidanceOptions,
  UseElementKeyboardAvoidanceResult,
} from './useElementKeyboardAvoidance.types';

const DEFAULT_BOTTOM_MARGIN = 16;
const DEFAULT_THRESHOLD = 150;

export function useElementKeyboardAvoidance<T extends HTMLElement>(
  elementRef: RefObject<T | null>,
  options: UseElementKeyboardAvoidanceOptions = {},
): UseElementKeyboardAvoidanceResult {
  const { enabled = true, bottomMargin = DEFAULT_BOTTOM_MARGIN, threshold = DEFAULT_THRESHOLD } = options;
  const [keyboardAvoidanceOffset, setKeyboardAvoidanceOffset] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsKeyboardVisible(false);
      setKeyboardAvoidanceOffset(0);
      return;
    }

    if (typeof window === 'undefined' || !window.visualViewport) {
      setIsKeyboardVisible(false);
      setKeyboardAvoidanceOffset(0);
      return;
    }

    const viewport = window.visualViewport;
    let animationFrame: number | null = null;
    let currentOffset = 0;

    const calculateOffset = () => {
      animationFrame = null;

      const element = elementRef.current;
      if (!element) {
        currentOffset = 0;
        setIsKeyboardVisible(false);
        setKeyboardAvoidanceOffset(0);
        return;
      }

      const viewportHeightDiff = window.innerHeight - viewport.height;
      const keyboardVisible = viewportHeightDiff > threshold;
      setIsKeyboardVisible(keyboardVisible);

      if (!keyboardVisible) {
        currentOffset = 0;
        setKeyboardAvoidanceOffset(0);
        return;
      }

      const keyboardTop = viewport.height + viewport.offsetTop;
      // getBoundingClientRect reflects the applied transform; add currentOffset back
      // to measure the untransformed layout position.
      const elementBottom = element.getBoundingClientRect().bottom + currentOffset;
      const offset = Math.max(0, Math.ceil(elementBottom - keyboardTop + bottomMargin));
      currentOffset = offset;
      setKeyboardAvoidanceOffset(offset);
    };

    const scheduleCalculateOffset = () => {
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(calculateOffset);
    };

    calculateOffset();
    viewport.addEventListener('resize', scheduleCalculateOffset);
    viewport.addEventListener('scroll', scheduleCalculateOffset);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleCalculateOffset) : undefined;
    if (elementRef.current) resizeObserver?.observe(elementRef.current);

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      viewport.removeEventListener('resize', scheduleCalculateOffset);
      viewport.removeEventListener('scroll', scheduleCalculateOffset);
      resizeObserver?.disconnect();
    };
  }, [bottomMargin, elementRef, enabled, threshold]);

  return {
    isKeyboardVisible,
    keyboardAvoidanceOffset,
    keyboardAvoidanceStyle:
      keyboardAvoidanceOffset > 0 ? { transform: `translateY(-${keyboardAvoidanceOffset}px)` } : undefined,
  };
}
