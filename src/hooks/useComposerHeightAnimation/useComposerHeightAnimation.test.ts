import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPOSER_COLLAPSE_DURATION,
  COMPOSER_EXPAND_DURATION,
  COMPOSER_HEIGHT_EASE,
} from '@/libs/motion/composerMotion';
import { useComposerHeightAnimation } from './useComposerHeightAnimation';

describe('useComposerHeightAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks measured pixel height while resting, with tween disabled', () => {
    const { result } = renderHook(() =>
      useComposerHeightAnimation({
        isExpanded: false,
        measuredHeight: 80,
        shouldReduceMotion: false,
      }),
    );

    expect(result.current.animatedHeight).toBe(80);
    expect(result.current.isAnimatingHeight).toBe(false);
    expect(result.current.heightTransition).toEqual({ duration: 0 });
    expect(result.current.heightTransitionStyle).toEqual({ transition: 'none' });
  });

  it('enables the expand tween when isExpanded flips, then disables after complete', () => {
    const { result, rerender } = renderHook(
      ({ isExpanded, measuredHeight }) =>
        useComposerHeightAnimation({
          isExpanded,
          measuredHeight,
          shouldReduceMotion: false,
        }),
      { initialProps: { isExpanded: false, measuredHeight: 80 } },
    );

    rerender({ isExpanded: true, measuredHeight: 80 });
    expect(result.current.isAnimatingHeight).toBe(true);
    expect(result.current.animatedHeight).toBe(80);
    expect(result.current.heightTransition).toEqual({
      duration: COMPOSER_EXPAND_DURATION,
      ease: COMPOSER_HEIGHT_EASE,
    });

    // No-op complete at the pre-transition height must not end the tween early.
    act(() => {
      result.current.onHeightAnimationComplete();
    });
    expect(result.current.isAnimatingHeight).toBe(true);

    rerender({ isExpanded: true, measuredHeight: 260 });
    expect(result.current.animatedHeight).toBe(260);

    act(() => {
      result.current.onHeightAnimationComplete();
    });

    expect(result.current.isAnimatingHeight).toBe(false);
    expect(result.current.animatedHeight).toBe(260);
    expect(result.current.heightTransition).toEqual({ duration: 0 });
    expect(result.current.heightTransitionStyle).toEqual({ transition: 'none' });
  });

  it('does not re-enable the tween when measured height changes while resting expanded', () => {
    const { result, rerender } = renderHook(
      ({ isExpanded, measuredHeight }) =>
        useComposerHeightAnimation({
          isExpanded,
          measuredHeight,
          shouldReduceMotion: false,
        }),
      { initialProps: { isExpanded: false, measuredHeight: 80 } },
    );

    rerender({ isExpanded: true, measuredHeight: 260 });
    act(() => {
      result.current.onHeightAnimationComplete();
    });
    expect(result.current.isAnimatingHeight).toBe(false);
    expect(result.current.heightTransition).toEqual({ duration: 0 });

    rerender({ isExpanded: true, measuredHeight: 320 });
    expect(result.current.animatedHeight).toBe(320);
    expect(result.current.isAnimatingHeight).toBe(false);
    expect(result.current.heightTransition).toEqual({ duration: 0 });
  });

  it('uses the pre-transition height when expand and measure update together', () => {
    const { result, rerender } = renderHook(
      ({ isExpanded, measuredHeight }) =>
        useComposerHeightAnimation({
          isExpanded,
          measuredHeight,
          shouldReduceMotion: false,
        }),
      { initialProps: { isExpanded: false, measuredHeight: 80 } },
    );

    rerender({ isExpanded: true, measuredHeight: 260 });
    expect(result.current.isAnimatingHeight).toBe(true);

    act(() => {
      result.current.onHeightAnimationComplete();
    });
    expect(result.current.isAnimatingHeight).toBe(false);
    expect(result.current.heightTransition).toEqual({ duration: 0 });
  });

  it('enables the collapse tween then disables after complete', () => {
    const { result, rerender } = renderHook(
      ({ isExpanded, measuredHeight }) =>
        useComposerHeightAnimation({
          isExpanded,
          measuredHeight,
          shouldReduceMotion: false,
        }),
      { initialProps: { isExpanded: true, measuredHeight: 260 } },
    );

    expect(result.current.animatedHeight).toBe(260);
    expect(result.current.heightTransition).toEqual({ duration: 0 });

    rerender({ isExpanded: false, measuredHeight: 260 });
    expect(result.current.isAnimatingHeight).toBe(true);
    expect(result.current.heightTransition).toEqual({
      duration: COMPOSER_COLLAPSE_DURATION,
      ease: COMPOSER_HEIGHT_EASE,
    });

    act(() => {
      result.current.onHeightAnimationComplete();
    });
    // Still at the pre-collapse height — keep tweening until layout shrinks.
    expect(result.current.isAnimatingHeight).toBe(true);

    rerender({ isExpanded: false, measuredHeight: 80 });
    act(() => {
      result.current.onHeightAnimationComplete();
    });

    expect(result.current.isAnimatingHeight).toBe(false);
    expect(result.current.heightTransition).toEqual({ duration: 0 });
  });

  it('ends the tween via settle timeout when animation complete never fires', () => {
    const { result, rerender } = renderHook(
      ({ isExpanded, measuredHeight }) =>
        useComposerHeightAnimation({
          isExpanded,
          measuredHeight,
          shouldReduceMotion: false,
        }),
      { initialProps: { isExpanded: false, measuredHeight: 80 } },
    );

    rerender({ isExpanded: true, measuredHeight: 260 });
    expect(result.current.isAnimatingHeight).toBe(true);

    act(() => {
      vi.advanceTimersByTime(COMPOSER_EXPAND_DURATION * 1000 + 100);
    });

    expect(result.current.isAnimatingHeight).toBe(false);
    expect(result.current.heightTransition).toEqual({ duration: 0 });
  });

  it('stays at auto when reduced motion or skipAnimation is set', () => {
    const reduced = renderHook(() =>
      useComposerHeightAnimation({
        isExpanded: true,
        measuredHeight: 260,
        shouldReduceMotion: true,
      }),
    );
    expect(reduced.result.current.animatedHeight).toBe('auto');
    expect(reduced.result.current.heightTransition).toEqual({ duration: 0 });

    const skipped = renderHook(() =>
      useComposerHeightAnimation({
        isExpanded: true,
        measuredHeight: 260,
        shouldReduceMotion: false,
        skipAnimation: true,
      }),
    );
    expect(skipped.result.current.animatedHeight).toBe('auto');
    expect(skipped.result.current.heightTransitionStyle).toEqual({ transition: 'none' });
  });
});
