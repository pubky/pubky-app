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

function parseTranslateY(transform: string): number {
  if (!transform || transform === 'none') return 0;

  if (typeof DOMMatrixReadOnly !== 'undefined') {
    try {
      return new DOMMatrixReadOnly(transform).m42;
    } catch {
      // Fall through to manual parsing for test environments and older browsers.
    }
  }

  const matrix = transform.match(/^matrix\((.+)\)$/);
  if (matrix?.[1]) {
    const values = matrix[1].split(',').map((value) => Number.parseFloat(value.trim()));
    return values[5] || 0;
  }

  const matrix3d = transform.match(/^matrix3d\((.+)\)$/);
  if (matrix3d?.[1]) {
    const values = matrix3d[1].split(',').map((value) => Number.parseFloat(value.trim()));
    return values[13] || 0;
  }

  const translateY = transform.match(/^translateY\(([-\d.]+)px\)$/);
  if (translateY?.[1]) return Number.parseFloat(translateY[1]);

  const translate3d = transform.match(/^translate3d\([^,]+,\s*([-\d.]+)px,/);
  if (translate3d?.[1]) return Number.parseFloat(translate3d[1]);

  return 0;
}

function getElementTranslateY(element: HTMLElement): number {
  return parseTranslateY(window.getComputedStyle(element).transform);
}

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

    const calculateOffset = () => {
      animationFrame = null;

      const element = elementRef.current;
      if (!element) {
        setIsKeyboardVisible(false);
        setKeyboardAvoidanceOffset(0);
        return;
      }

      const viewportHeightDiff = window.innerHeight - viewport.height;
      const keyboardVisible = viewportHeightDiff > threshold;
      setIsKeyboardVisible(keyboardVisible);

      if (!keyboardVisible) {
        setKeyboardAvoidanceOffset(0);
        return;
      }

      const keyboardTop = viewport.height + viewport.offsetTop;
      // getBoundingClientRect reflects active CSS animations/transitions. Use the
      // actual computed translateY so keyboard resize events during transform
      // transitions do not over-correct based on a stale requested offset.
      const rect = element.getBoundingClientRect();
      const elementTranslateY = getElementTranslateY(element);
      const elementBottom = rect.bottom - elementTranslateY;
      const elementTop = rect.top - elementTranslateY;
      const overlap = elementBottom - keyboardTop + bottomMargin;
      // Never lift so far that the element's top is pushed above the top inset.
      // This keeps tall elements (e.g. an article editor) on screen and scrolling
      // internally instead of flying off the top of the viewport.
      const maxLift = Math.max(0, elementTop - topInset);
      const offset = Math.max(0, Math.min(Math.ceil(overlap), Math.floor(maxLift)));
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
