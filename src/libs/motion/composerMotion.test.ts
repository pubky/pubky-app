import { describe, expect, it } from 'vitest';
import {
  COMPOSER_COLLAPSE_DURATION,
  COMPOSER_EXPAND_DURATION,
  COMPOSER_HEIGHT_EASE,
  COMPOSER_REVEAL_EASE,
  getComposerDissolveVariants,
  getComposerHeightTransition,
  getComposerHeightTransitionStyle,
} from './composerMotion';

describe('composerMotion', () => {
  describe('timing constants', () => {
    it('exports cubic-bezier control points as 4-tuples', () => {
      expect(COMPOSER_REVEAL_EASE).toEqual([0.19, 1, 0.22, 1]);
      expect(COMPOSER_HEIGHT_EASE).toEqual([0.25, 1, 0.5, 1]);
    });

    it('exports expand slower than collapse', () => {
      expect(COMPOSER_EXPAND_DURATION).toBe(0.28);
      expect(COMPOSER_COLLAPSE_DURATION).toBe(0.22);
      expect(COMPOSER_EXPAND_DURATION).toBeGreaterThan(COMPOSER_COLLAPSE_DURATION);
    });
  });

  describe('getComposerDissolveVariants', () => {
    it('returns blur/fade reveal variants when motion is allowed', () => {
      const variants = getComposerDissolveVariants(false);

      expect(variants.hidden).toMatchObject({ opacity: 0, filter: 'blur(2px)' });
      expect(variants.visible).toMatchObject({
        opacity: 1,
        filter: 'blur(0px)',
        transition: { duration: 0.22, delay: 0.04, ease: COMPOSER_REVEAL_EASE },
      });
      expect(variants.exit).toMatchObject({
        opacity: 0,
        filter: 'blur(2px)',
        transition: { duration: 0.14, ease: COMPOSER_REVEAL_EASE },
      });
    });

    it('returns reduced-motion variants without blur when reduced motion is preferred', () => {
      const variants = getComposerDissolveVariants(true);

      expect(variants.hidden).toMatchObject({ opacity: 0.6, filter: 'blur(0px)' });
      expect(variants.visible).toMatchObject({
        opacity: 1,
        filter: 'blur(0px)',
        transition: { duration: 0.14, ease: COMPOSER_REVEAL_EASE },
      });
      expect(variants.exit).toMatchObject({
        opacity: 0.6,
        filter: 'blur(0px)',
        transition: { duration: 0.1, ease: COMPOSER_REVEAL_EASE },
      });
    });

    it('treats null reduced-motion preference as motion allowed', () => {
      expect(getComposerDissolveVariants(null)).toBe(getComposerDissolveVariants(false));
    });
  });

  describe('getComposerHeightTransition', () => {
    it('uses expand duration when expanded', () => {
      expect(getComposerHeightTransition(true, false)).toEqual({
        duration: COMPOSER_EXPAND_DURATION,
        ease: COMPOSER_HEIGHT_EASE,
      });
    });

    it('uses collapse duration when collapsed', () => {
      expect(getComposerHeightTransition(false, false)).toEqual({
        duration: COMPOSER_COLLAPSE_DURATION,
        ease: COMPOSER_HEIGHT_EASE,
      });
    });

    it('disables the tween when reduced motion is preferred', () => {
      expect(getComposerHeightTransition(true, true)).toEqual({ duration: 0 });
      expect(getComposerHeightTransition(false, true)).toEqual({ duration: 0 });
    });

    it('treats null reduced-motion preference as motion allowed', () => {
      expect(getComposerHeightTransition(true, null)).toEqual(getComposerHeightTransition(true, false));
      expect(getComposerHeightTransition(false, null)).toEqual(getComposerHeightTransition(false, false));
    });
  });

  describe('getComposerHeightTransitionStyle', () => {
    const expectedEase = `cubic-bezier(${COMPOSER_HEIGHT_EASE.join(', ')})`;

    it('returns a CSS height transition matching expand duration', () => {
      expect(getComposerHeightTransitionStyle(true, false)).toEqual({
        transition: `height 280ms ${expectedEase}`,
      });
    });

    it('returns a CSS height transition matching collapse duration', () => {
      expect(getComposerHeightTransitionStyle(false, false)).toEqual({
        transition: `height 220ms ${expectedEase}`,
      });
    });

    it('disables the CSS transition when reduced motion is preferred', () => {
      expect(getComposerHeightTransitionStyle(true, true)).toEqual({ transition: 'none' });
      expect(getComposerHeightTransitionStyle(false, true)).toEqual({ transition: 'none' });
    });

    it('keeps CSS durations in sync with the framer height tween', () => {
      const expandFramer = getComposerHeightTransition(true, false);
      const collapseFramer = getComposerHeightTransition(false, false);
      const expandCss = getComposerHeightTransitionStyle(true, false).transition as string;
      const collapseCss = getComposerHeightTransitionStyle(false, false).transition as string;

      expect(expandCss).toContain(`${Math.round(expandFramer.duration * 1000)}ms`);
      expect(collapseCss).toContain(`${Math.round(collapseFramer.duration * 1000)}ms`);
      expect(expandCss).toContain(expectedEase);
      expect(collapseCss).toContain(expectedEase);
    });
  });
});
