import { describe, expect, it } from 'vitest';
import { LAYOUT } from '@/stores/home/home.types';
import { getEffectiveTagsLayout, getTagsLayoutForSurfaceLayout, usesWidePostInput } from './PostMainLayoutRules';

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
