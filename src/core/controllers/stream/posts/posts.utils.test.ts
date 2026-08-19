import { describe, expect, it } from 'vitest';
import { resolveResumeAnchor } from './posts.utils';

describe('resolveResumeAnchor', () => {
  it('prefers the raw scan anchor over the last visible id', () => {
    expect(
      resolveResumeAnchor({
        nextPageIds: ['user-1:post-1', 'user-1:post-2'],
        lastRawPostId: 'user-1:filtered-9',
      }),
    ).toBe('user-1:filtered-9');
  });

  it('returns the raw anchor on a fully-filtered (empty visible) page', () => {
    // The livelock case: nothing visible, but the raw scan advanced — resuming
    // from this anchor is what prevents rescanning the filtered run.
    expect(
      resolveResumeAnchor({
        nextPageIds: [],
        lastRawPostId: 'user-1:filtered-200',
      }),
    ).toBe('user-1:filtered-200');
  });

  it('falls back to the last visible id when no raw anchor is threaded', () => {
    expect(
      resolveResumeAnchor({
        nextPageIds: ['user-1:post-1', 'user-1:post-2'],
      }),
    ).toBe('user-1:post-2');
  });

  it('returns undefined when the response carries no anchor at all', () => {
    // Callers keep their previous anchor in this case rather than clobbering it.
    expect(resolveResumeAnchor({ nextPageIds: [] })).toBeUndefined();
  });
});
