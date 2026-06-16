'use client';

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type {
  UseElementKeyboardAvoidanceOptions,
  UseElementKeyboardAvoidanceResult,
} from './useElementKeyboardAvoidance.types';

const DEFAULT_BOTTOM_MARGIN = 0;
const DEFAULT_THRESHOLD = 150;
const DEFAULT_TOP_INSET = 16;

export function useElementKeyboardAvoidance<T extends HTMLElement>(
  elementRef: RefObject<T | null>,
  options: UseElementKeyboardAvoidanceOptions = {},
): UseElementKeyboardAvoidanceResult {
  const {
    enabled = true,
    bottomMargin = DEFAULT_BOTTOM_MARGIN,
    threshold = DEFAULT_THRESHOLD,
    topInset = DEFAULT_TOP_INSET,
  } = options;
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
      const rect = element.getBoundingClientRect();
      const elementBottom = rect.bottom + currentOffset;
      const elementTop = rect.top + currentOffset;
      const overlap = elementBottom - keyboardTop + bottomMargin;
      // Never lift so far that the element's top is pushed above the top inset.
      // This keeps tall elements (e.g. an article editor) on screen and scrolling
      // internally instead of flying off the top of the viewport.
      const maxLift = Math.max(0, elementTop - topInset);
      const offset = Math.max(0, Math.min(Math.ceil(overlap), Math.floor(maxLift)));
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
  }, [bottomMargin, elementRef, enabled, threshold, topInset]);

  return {
    isKeyboardVisible,
    keyboardAvoidanceOffset,
    keyboardAvoidanceStyle:
      keyboardAvoidanceOffset > 0 ? { transform: `translateY(-${keyboardAvoidanceOffset}px)` } : undefined,
  };
}
