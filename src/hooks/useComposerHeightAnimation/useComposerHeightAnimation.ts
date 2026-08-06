'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  COMPOSER_COLLAPSE_DURATION,
  COMPOSER_EXPAND_DURATION,
  getComposerHeightTransition,
  getComposerHeightTransitionStyle,
} from '@/libs/motion/composerMotion';

/** Extra settle time so late ResizeObserver updates during expand still tween. */
const HEIGHT_ANIMATION_SETTLE_MS = 100;

type ComposerHeightAnimationParams = {
  isExpanded: boolean;
  measuredHeight: number;
  shouldReduceMotion: boolean | null;
  /** Skip the tween entirely (e.g. forced-expanded dialog composers). */
  skipAnimation?: boolean;
};

type ComposerHeightAnimationResult = {
  /** Framer `animate.height` target. */
  animatedHeight: number | 'auto';
  heightTransition: ReturnType<typeof getComposerHeightTransition>;
  /** CSS transition for non-framer peers (QuickReply connector); none while resting. */
  heightTransitionStyle: CSSProperties;
  onHeightAnimationComplete: () => void;
  isAnimatingHeight: boolean;
};

/**
 * Animates composer card height only across `isExpanded` transitions.
 *
 * The wrapper keeps tracking the measured pixel height (same as before), but the
 * 220–280ms tween is enabled only while expand/collapse is in flight. Content-
 * driven growth (line wraps, attachments) still updates height with `duration: 0`
 * so it snaps in one frame instead of easing the feed below the composer.
 *
 * Expansion is detected during render via state (React re-renders before paint)
 * so the tween flag is on for the first frame that mounts expanded content.
 * Completing the no-op "lock to current height" frame is ignored — otherwise
 * Motion ends the tween before the expanded layout is measured and the card
 * stutters/snaps.
 */
export function useComposerHeightAnimation({
  isExpanded,
  measuredHeight,
  shouldReduceMotion,
  skipAnimation = false,
}: ComposerHeightAnimationParams): ComposerHeightAnimationResult {
  const reduceOrSkip = Boolean(shouldReduceMotion || skipAnimation);
  const hasMeasured = measuredHeight > 0;

  const [isAnimatingHeight, setIsAnimatingHeight] = useState(false);
  const [prevExpanded, setPrevExpanded] = useState(isExpanded);
  const [previousMeasuredHeight, setPreviousMeasuredHeight] = useState(measuredHeight);
  const [heightAtTransitionStart, setHeightAtTransitionStart] = useState<number | null>(null);

  // Adjust state during render when isExpanded flips — React re-renders before
  // paint so expand/collapse never starts with the tween flag still off.
  if (!reduceOrSkip && isExpanded !== prevExpanded) {
    setPrevExpanded(isExpanded);
    // Prefer the resting height from before this toggle so a same-render measure
    // update (collapsed → expanded height) still counts as a real tween target.
    const startHeight = previousMeasuredHeight;
    setHeightAtTransitionStart(startHeight > 0 ? startHeight : hasMeasured ? measuredHeight : null);
    setPreviousMeasuredHeight(measuredHeight);
    setIsAnimatingHeight(true);
  } else if (reduceOrSkip && (isAnimatingHeight || isExpanded !== prevExpanded)) {
    setPrevExpanded(isExpanded);
    setHeightAtTransitionStart(null);
    setPreviousMeasuredHeight(measuredHeight);
    if (isAnimatingHeight) setIsAnimatingHeight(false);
  }

  // Track resting measured height for the next transition's start value.
  useEffect(() => {
    if (!isAnimatingHeight) {
      setPreviousMeasuredHeight(measuredHeight);
    }
  }, [measuredHeight, isAnimatingHeight]);

  // Safety net: end the tween window after the curve duration once height settles.
  // Resets when `measuredHeight` changes so late expand layout still animates.
  useEffect(() => {
    if (!isAnimatingHeight || reduceOrSkip) return;

    const durationMs = (isExpanded ? COMPOSER_EXPAND_DURATION : COMPOSER_COLLAPSE_DURATION) * 1000;
    const timeoutId = window.setTimeout(() => {
      setHeightAtTransitionStart(null);
      setIsAnimatingHeight(false);
    }, durationMs + HEIGHT_ANIMATION_SETTLE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isAnimatingHeight, isExpanded, measuredHeight, reduceOrSkip]);

  const shouldTween = isAnimatingHeight && !reduceOrSkip;

  // Always follow the measured pixel height once available (preserves the
  // expand/collapse easing). Reduced-motion / unmeasured / forced-expanded
  // dialogs rest at auto. Content growth while !shouldTween still snaps because
  // the transition duration is 0.
  const animatedHeight: number | 'auto' = reduceOrSkip || !hasMeasured ? 'auto' : measuredHeight;

  const heightTransition = getComposerHeightTransition(isExpanded, !shouldTween);
  const heightTransitionStyle = getComposerHeightTransitionStyle(isExpanded, !shouldTween);

  const onHeightAnimationComplete = () => {
    if (!isAnimatingHeight) return;

    // Ignore the no-op completion that fires when we lock to the pre-transition
    // pixel height before expanded/collapsed content has reflowed. Ending here
    // would leave the real height change on duration:0 and stutter/snap.
    if (heightAtTransitionStart !== null && measuredHeight === heightAtTransitionStart) {
      return;
    }

    setHeightAtTransitionStart(null);
    setIsAnimatingHeight(false);
  };

  return {
    animatedHeight,
    heightTransition,
    heightTransitionStyle,
    onHeightAnimationComplete,
    isAnimatingHeight,
  };
}
