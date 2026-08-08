import type { Variants } from 'motion/react';
import type { CSSProperties } from 'react';

/**
 * Single source of truth for post composer motion (PostInput + QuickReply).
 * Both composers must expand/collapse identically, and the QuickReply thread
 * connector must track the card height with the exact same curve, so the
 * framer transitions and the connector's CSS transition are derived from
 * these constants instead of being re-typed per component.
 *
 * Height tweens are gated by `useComposerHeightAnimation`: expand/collapse
 * uses the durations below; content-driven growth keeps `duration: 0` so it snaps.
 */
export const COMPOSER_REVEAL_EASE = [0.19, 1, 0.22, 1] as const;
export const COMPOSER_HEIGHT_EASE = [0.25, 1, 0.5, 1] as const;

export const COMPOSER_EXPAND_DURATION = 0.28;
export const COMPOSER_COLLAPSE_DURATION = 0.22;

const COMPOSER_SELECTIVE_DISSOLVE_VARIANTS = {
  hidden: {
    opacity: 0,
    filter: 'blur(2px)',
  },
  visible: {
    opacity: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.22,
      delay: 0.04,
      ease: COMPOSER_REVEAL_EASE,
    },
  },
  exit: {
    opacity: 0,
    filter: 'blur(2px)',
    transition: {
      duration: 0.14,
      ease: COMPOSER_REVEAL_EASE,
    },
  },
} satisfies Variants;

const REDUCED_COMPOSER_SELECTIVE_DISSOLVE_VARIANTS = {
  hidden: {
    opacity: 0.6,
    filter: 'blur(0px)',
  },
  visible: {
    opacity: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.14, ease: COMPOSER_REVEAL_EASE },
  },
  exit: {
    opacity: 0.6,
    filter: 'blur(0px)',
    transition: { duration: 0.1, ease: COMPOSER_REVEAL_EASE },
  },
} satisfies Variants;

/** Blur/fade variants for content revealed when a composer expands. */
export function getComposerDissolveVariants(shouldReduceMotion: boolean | null): Variants {
  return shouldReduceMotion ? REDUCED_COMPOSER_SELECTIVE_DISSOLVE_VARIANTS : COMPOSER_SELECTIVE_DISSOLVE_VARIANTS;
}

/** Framer height tween for the composer card. */
export function getComposerHeightTransition(isExpanded: boolean, shouldReduceMotion: boolean | null) {
  if (shouldReduceMotion) return { duration: 0 };

  return {
    duration: isExpanded ? COMPOSER_EXPAND_DURATION : COMPOSER_COLLAPSE_DURATION,
    ease: COMPOSER_HEIGHT_EASE,
  };
}

const CSS_HEIGHT_EASE = `cubic-bezier(${COMPOSER_HEIGHT_EASE.join(', ')})`;
const toMs = (seconds: number) => `${Math.round(seconds * 1000)}ms`;

/**
 * CSS height transition matching `getComposerHeightTransition`, for elements
 * animated outside framer (the QuickReply thread connector).
 */
export function getComposerHeightTransitionStyle(
  isExpanded: boolean,
  shouldReduceMotion: boolean | null,
): CSSProperties {
  if (shouldReduceMotion) return { transition: 'none' };

  const duration = toMs(isExpanded ? COMPOSER_EXPAND_DURATION : COMPOSER_COLLAPSE_DURATION);

  return { transition: `height ${duration} ${CSS_HEIGHT_EASE}` };
}
