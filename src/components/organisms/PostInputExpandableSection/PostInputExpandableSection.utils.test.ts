import { describe, expect, it } from 'vitest';
import { POST_INPUT_VARIANT } from '../PostInput/PostInput.constants';
import { getButtonLabel } from './PostInputExpandableSection.utils';

describe('getButtonLabel', () => {
  it('returns "Post" for POST variant', () => {
    expect(getButtonLabel(POST_INPUT_VARIANT.POST)).toBe('Post');
  });

  it('returns "Reply" for REPLY variant', () => {
    expect(getButtonLabel(POST_INPUT_VARIANT.REPLY)).toBe('Reply');
  });

  it('returns "Repost" for REPOST variant', () => {
    expect(getButtonLabel(POST_INPUT_VARIANT.REPOST)).toBe('Repost');
  });

  it('returns "Edit" for EDIT variant', () => {
    expect(getButtonLabel(POST_INPUT_VARIANT.EDIT)).toBe('Edit');
  });

  it('returns "Post" for undefined variant', () => {
    expect(getButtonLabel(undefined)).toBe('Post');
  });

  it('returns "Post" for unknown variant', () => {
    // @ts-expect-error - testing invalid input
    expect(getButtonLabel('unknown')).toBe('Post');
  });

  // Note: In practice, isArticle is only true when variant is POST (article sub-mode).
  // These tests cover the function's actual behavior exhaustively for completeness.
  describe('isArticle parameter', () => {
    it('returns "Publish" when isArticle is true', () => {
      expect(getButtonLabel(POST_INPUT_VARIANT.POST, true)).toBe('Publish');
    });

    it('returns "Publish" when isArticle is true for non-EDIT variants', () => {
      expect(getButtonLabel(POST_INPUT_VARIANT.REPLY, true)).toBe('Publish');
      expect(getButtonLabel(POST_INPUT_VARIANT.REPOST, true)).toBe('Publish');
      expect(getButtonLabel(undefined, true)).toBe('Publish');
    });

    it('returns "Edit" when isArticle is true but variant is EDIT', () => {
      expect(getButtonLabel(POST_INPUT_VARIANT.EDIT, true)).toBe('Edit');
    });

    it('returns variant label when isArticle is false', () => {
      expect(getButtonLabel(POST_INPUT_VARIANT.POST, false)).toBe('Post');
      expect(getButtonLabel(POST_INPUT_VARIANT.REPLY, false)).toBe('Reply');
    });

    it('returns variant label when isArticle is undefined', () => {
      expect(getButtonLabel(POST_INPUT_VARIANT.POST, undefined)).toBe('Post');
      expect(getButtonLabel(POST_INPUT_VARIANT.REPLY, undefined)).toBe('Reply');
      expect(getButtonLabel(POST_INPUT_VARIANT.EDIT, undefined)).toBe('Edit');
    });
  });
});
