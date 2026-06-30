import { describe, expect, it } from 'vitest';
import { getModeratedTags, getModerationId } from '@/config/moderation';
import { detectModerationFromTags, shouldBlur } from './moderation.utils';

describe('moderation.utils', () => {
  describe('detectModerationFromTags', () => {
    it('should return false for null tags', () => {
      const result = detectModerationFromTags(null);
      expect(result).toBe(false);
    });

    it('should return false for undefined tags', () => {
      const result = detectModerationFromTags(undefined);
      expect(result).toBe(false);
    });

    it('should return false for empty tags array', () => {
      const result = detectModerationFromTags([]);
      expect(result).toBe(false);
    });

    it('should return true when tag has moderation label and moderation tagger', () => {
      const tags = [
        {
          label: getModeratedTags()[0],
          taggers: [getModerationId()],
        },
      ];

      const result = detectModerationFromTags(tags);
      expect(result).toBe(true);
    });

    it('should return false when tag has moderation label but wrong tagger', () => {
      const tags = [
        {
          label: getModeratedTags()[0],
          taggers: ['other-tagger'],
        },
      ];

      const result = detectModerationFromTags(tags);
      expect(result).toBe(false);
    });

    it('should return false when tag has moderation tagger but wrong label', () => {
      const tags = [
        {
          label: 'other-label',
          taggers: [getModerationId()],
        },
      ];

      const result = detectModerationFromTags(tags);
      expect(result).toBe(false);
    });

    it('should return true when one of multiple tags is moderated', () => {
      const tags = [
        {
          label: 'not-moderated',
          taggers: ['other-tagger'],
        },
        {
          label: getModeratedTags()[0],
          taggers: [getModerationId()],
        },
        {
          label: 'another-label',
          taggers: ['another-tagger'],
        },
      ];

      const result = detectModerationFromTags(tags);
      expect(result).toBe(true);
    });
  });

  describe('shouldBlur', () => {
    it('should return false when blur is disabled globally', () => {
      const result = shouldBlur(true, true);
      expect(result).toBe(false);
    });

    it('should return true when item is blurred and blur is enabled globally', () => {
      const result = shouldBlur(true, false);
      expect(result).toBe(true);
    });

    it('should return false when item is not blurred', () => {
      const result = shouldBlur(false, false);
      expect(result).toBe(false);
    });

    it('should return false when item is not blurred even if blur enabled globally', () => {
      const result = shouldBlur(false, false);
      expect(result).toBe(false);
    });
  });
});
