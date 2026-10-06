import { describe, expect, it } from 'vitest';
import type { UsePostHeaderVisibilityResult } from './usePostHeaderVisibility.types';
import { getDisplayedPostId, getInteractionPostId } from './usePostHeaderVisibility.utils';

const REPOST_ID = 'reposter:repost-1';
const ORIGINAL_ID = 'author:original-1';

function visibility(overrides: Partial<UsePostHeaderVisibilityResult>): UsePostHeaderVisibilityResult {
  return {
    showRepostHeader: false,
    shouldShowPostHeader: true,
    originalPostId: ORIGINAL_ID,
    isContentlessRepost: false,
    ...overrides,
  };
}

describe('getInteractionPostId', () => {
  it('targets the original for the author of a contentless repost', () => {
    const v = visibility({ showRepostHeader: true, shouldShowPostHeader: false, isContentlessRepost: true });
    expect(getInteractionPostId(REPOST_ID, v)).toBe(ORIGINAL_ID);
    expect(getDisplayedPostId(REPOST_ID, v)).toBe(ORIGINAL_ID);
  });

  it('targets the original for a non-owner viewing a contentless repost, while the shell keeps the repost', () => {
    const v = visibility({ isContentlessRepost: true });
    expect(getInteractionPostId(REPOST_ID, v)).toBe(ORIGINAL_ID);
    expect(getDisplayedPostId(REPOST_ID, v)).toBe(REPOST_ID);
  });

  it('keeps the quote repost as its own target', () => {
    expect(getInteractionPostId(REPOST_ID, visibility({}))).toBe(REPOST_ID);
  });

  it('keeps an attachment-only repost as its own target', () => {
    expect(getInteractionPostId(REPOST_ID, visibility({ isContentlessRepost: false }))).toBe(REPOST_ID);
  });

  it('falls back to the post id when the original id is unavailable', () => {
    expect(getInteractionPostId(REPOST_ID, visibility({ isContentlessRepost: true, originalPostId: null }))).toBe(
      REPOST_ID,
    );
  });
});
