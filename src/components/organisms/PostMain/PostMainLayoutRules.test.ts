import { describe, expect, it } from 'vitest';
import { LAYOUT } from '@/stores/home/home.types';
import {
  getEffectiveTagsLayout,
  getTagsLayoutForSurfaceLayout,
  POST_INPUT_HEADER_SIZE_BY_TAGS_LAYOUT,
} from './PostMainLayoutRules';

describe('PostMainLayoutRules', () => {
  describe('getTagsLayoutForSurfaceLayout', () => {
    it('maps wide, list, and columns layouts', () => {
      expect(getTagsLayoutForSurfaceLayout(LAYOUT.WIDE)).toBe('side');
      expect(getTagsLayoutForSurfaceLayout(LAYOUT.LIST)).toBe('list');
      expect(getTagsLayoutForSurfaceLayout(LAYOUT.COLUMNS)).toBe('inline');
    });
  });

  describe('POST_INPUT_HEADER_SIZE_BY_TAGS_LAYOUT', () => {
    it('maps list to normal, wide to extraLarge, and column to normal', () => {
      expect(POST_INPUT_HEADER_SIZE_BY_TAGS_LAYOUT.list).toBe('normal');
      expect(POST_INPUT_HEADER_SIZE_BY_TAGS_LAYOUT.side).toBe('extraLarge');
      expect(POST_INPUT_HEADER_SIZE_BY_TAGS_LAYOUT.inline).toBe('normal');
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
