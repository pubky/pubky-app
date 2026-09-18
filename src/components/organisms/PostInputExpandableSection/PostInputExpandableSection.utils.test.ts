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

  // Note: In practice, isArticle is true for the article sub-mode of POST (create)
  // and of EDIT (edit an article). Articles always submit as "Publish", so the
  // article sub-mode never reads as "Edit".
  describe('isArticle parameter', () => {
    it('returns "Publish" when isArticle is true', () => {
      expect(getButtonLabel(POST_INPUT_VARIANT.POST, true)).toBe('Publish');
    });

    it('returns "Publish" when isArticle is true for other variants', () => {
      expect(getButtonLabel(POST_INPUT_VARIANT.REPLY, true)).toBe('Publish');
      expect(getButtonLabel(POST_INPUT_VARIANT.REPOST, true)).toBe('Publish');
      expect(getButtonLabel(undefined, true)).toBe('Publish');
    });

    it('returns "Publish" when isArticle is true and variant is EDIT (editing an article)', () => {
      expect(getButtonLabel(POST_INPUT_VARIANT.EDIT, true)).toBe('Publish');
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
