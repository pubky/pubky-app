import { describe, expect, it } from 'vitest';
import { LAYOUT } from '@/stores/home/home.types';
import {
  getEffectiveTagsLayout,
  getPostInputBodyTextClass,
  getPostInputPaddingClass,
  getTagsLayoutForSurfaceLayout,
  usesWidePostInput,
} from './PostMainLayoutRules';
import { WIDE_POST_BODY_TEXT_CLASS } from './PostMainTypography';

describe('PostMainLayoutRules', () => {
  describe('getTagsLayoutForSurfaceLayout', () => {
    it('maps wide, list, and columns layouts', () => {
      expect(getTagsLayoutForSurfaceLayout(LAYOUT.WIDE)).toBe('side');
      expect(getTagsLayoutForSurfaceLayout(LAYOUT.LIST)).toBe('list');
      expect(getTagsLayoutForSurfaceLayout(LAYOUT.COLUMNS)).toBe('inline');
    });
  });

  describe('usesWidePostInput', () => {
    it('returns true for side and list layouts', () => {
      expect(usesWidePostInput('side')).toBe(true);
      expect(usesWidePostInput('list')).toBe(true);
      expect(usesWidePostInput('inline')).toBe(false);
    });
  });

  describe('getPostInputPaddingClass', () => {
    it('maps each tags layout to PostInput container padding', () => {
      expect(getPostInputPaddingClass('inline')).toBe('p-6');
      expect(getPostInputPaddingClass('side')).toBe('p-12');
      expect(getPostInputPaddingClass('list')).toBe('p-6');
    });
  });

  describe('getPostInputBodyTextClass', () => {
    it('maps each tags layout to PostInput textarea typography', () => {
      expect(getPostInputBodyTextClass('inline')).toBeUndefined();
      expect(getPostInputBodyTextClass('side')).toBe(WIDE_POST_BODY_TEXT_CLASS);
      expect(getPostInputBodyTextClass('list')).toBe('text-base');
    });
  });

  describe('getEffectiveTagsLayout', () => {
    it('falls back side and list to inline on mobile', () => {
      expect(getEffectiveTagsLayout('side', true)).toBe('inline');
      expect(getEffectiveTagsLayout('list', true)).toBe('inline');
    });

    it('keeps the inherited layout on desktop', () => {
      expect(getEffectiveTagsLayout('side', false)).toBe('side');
      expect(getEffectiveTagsLayout('list', false)).toBe('list');
      expect(getEffectiveTagsLayout('inline', false)).toBe('inline');
    });
  });
});
