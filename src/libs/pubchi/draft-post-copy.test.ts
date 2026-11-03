import { describe, expect, it } from 'vitest';
import { DRAFT_POST_COPY } from './draft-post-copy';

describe('draft post copy', () => {
  it('exposes the in-card approval labels', () => {
    expect(DRAFT_POST_COPY.title).toBe('Draft post');
    expect(DRAFT_POST_COPY.publishAsYou).toBe('Publish as you');
    expect(DRAFT_POST_COPY.approve).toBe('Approve');
    expect(DRAFT_POST_COPY.reject).toBe('Reject');
    expect(DRAFT_POST_COPY.revert).toBe('Revert');
    expect(DRAFT_POST_COPY.published).toBe('Published as you');
    expect(DRAFT_POST_COPY.rejected).toBe('Rejected');
    expect(DRAFT_POST_COPY.reverted).toBe('Reverted');
  });
});
