'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { useKeyboardViewport } from '@/hooks/useKeyboardViewport/useKeyboardViewport';
import type {
  UseDialogKeyboardOrchestratorOptions,
  UseDialogKeyboardOrchestratorResult,
} from './useDialogKeyboardOrchestrator.types';

const DEFAULT_BOTTOM_MARGIN = 24;
const DEFAULT_THRESHOLD = 150;
const DEFAULT_TOP_INSET = 16;

const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'image',
  'button',
  'submit',
  'reset',
]);

function isKeyboardInput(target: Element | null): target is HTMLElement {
  if (!target) return false;

  if (target instanceof HTMLTextAreaElement) return true;

  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type);
  }

  return target instanceof HTMLElement && target.isContentEditable;
}

function scrollElementTo(element: HTMLElement, top: number) {
  const nextTop = Math.max(0, Math.ceil(top));

  if (typeof element.scrollTo === 'function') {
    element.scrollTo({ top: nextTop, behavior: 'auto' });
    return;
  }

  element.scrollTop = nextTop;
}

export function useDialogKeyboardOrchestrator<T extends HTMLElement>(
  contentRef: RefObject<T | null>,
  options: UseDialogKeyboardOrchestratorOptions = {},
): UseDialogKeyboardOrchestratorResult {
  const {
    enabled = true,
    topInset = DEFAULT_TOP_INSET,
    bottomMargin = DEFAULT_BOTTOM_MARGIN,
    threshold = DEFAULT_THRESHOLD,
  } = options;
  const { isKeyboardVisible, keyboardHeight, keyboardTop, viewportOffsetTop } = useKeyboardViewport({
    enabled,
    threshold,
  });
  const [spacerHeight, setSpacerHeight] = useState(0);
  const [scrollVersion, setScrollVersion] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const isCalculateScheduledRef = useRef(false);

  useEffect(() => {
    if (!enabled || !isKeyboardVisible || keyboardHeight <= 0) {
      setSpacerHeight(0);
      return;
    }

    const content = contentRef.current;
    if (!content || typeof window === 'undefined') {
      setSpacerHeight(0);
      return;
    }

    const calculateSpacer = () => {
      const activeElement = document.activeElement;
      if (!isKeyboardInput(activeElement) || !content.contains(activeElement)) {
        setSpacerHeight(0);
        return;
      }

      const contentRect = content.getBoundingClientRect();
      const activeRect = activeElement.getBoundingClientRect();
      const visibleBottom = keyboardTop - bottomMargin;
      const focusedOverlap = activeRect.bottom - visibleBottom;
      const contentOverlap = contentRect.bottom - visibleBottom;
      const nextSpacerHeight = Math.max(0, Math.ceil(focusedOverlap), Math.ceil(contentOverlap));

      setSpacerHeight(nextSpacerHeight);
      setScrollVersion((version) => version + 1);
    };

    const scheduleCalculateSpacer = () => {
      if (isCalculateScheduledRef.current) return;
      isCalculateScheduledRef.current = true;
      animationFrameRef.current = window.requestAnimationFrame(() => {
        isCalculateScheduledRef.current = false;
        animationFrameRef.current = null;
        calculateSpacer();
      });
    };

    scheduleCalculateSpacer();

    document.addEventListener('focusin', scheduleCalculateSpacer, true);
    document.addEventListener('focusout', scheduleCalculateSpacer, true);
    document.addEventListener('input', scheduleCalculateSpacer, true);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleCalculateSpacer) : undefined;
    resizeObserver?.observe(content);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      isCalculateScheduledRef.current = false;
      document.removeEventListener('focusin', scheduleCalculateSpacer, true);
      document.removeEventListener('focusout', scheduleCalculateSpacer, true);
      document.removeEventListener('input', scheduleCalculateSpacer, true);
      resizeObserver?.disconnect();
    };
  }, [bottomMargin, contentRef, enabled, isKeyboardVisible, keyboardHeight, keyboardTop]);

  useEffect(() => {
    if (!enabled || !isKeyboardVisible || spacerHeight <= 0 || typeof window === 'undefined') return;

    const animationFrame = window.requestAnimationFrame(() => {
      const content = contentRef.current;
      const activeElement = document.activeElement;

      if (!content || !isKeyboardInput(activeElement) || !content.contains(activeElement)) return;

      const contentRect = content.getBoundingClientRect();
      const activeRect = activeElement.getBoundingClientRect();
      const visibleTop = Math.max(contentRect.top, viewportOffsetTop) + topInset;
      const visibleBottom = Math.min(contentRect.bottom, keyboardTop) - bottomMargin;

      if (activeRect.bottom > visibleBottom) {
        scrollElementTo(content, content.scrollTop + activeRect.bottom - visibleBottom);
        return;
      }

      if (activeRect.top < visibleTop) {
        scrollElementTo(content, content.scrollTop + activeRect.top - visibleTop);
      }
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    bottomMargin,
    contentRef,
    enabled,
    isKeyboardVisible,
    keyboardTop,
    scrollVersion,
    spacerHeight,
    topInset,
    viewportOffsetTop,
  ]);

  const contentStyle: CSSProperties | undefined =
    enabled && isKeyboardVisible && spacerHeight > 0
      ? {
          scrollPaddingBottom: `${spacerHeight + bottomMargin}px`,
        }
      : undefined;

  return {
    isKeyboardVisible,
    spacerHeight,
    contentStyle,
  };
}
