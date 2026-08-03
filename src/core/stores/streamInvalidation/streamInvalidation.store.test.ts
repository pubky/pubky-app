import { beforeEach, describe, expect, it } from 'vitest';
import { useStreamInvalidationStore } from './streamInvalidation.store';

describe('useStreamInvalidationStore', () => {
  beforeEach(() => {
    useStreamInvalidationStore.getState().reset();
  });

  it('advances only the graph revision for an ordinary follow change', () => {
    useStreamInvalidationStore.getState().invalidateFollowDependentStreams({ includeFriends: false });

    expect(useStreamInvalidationStore.getState()).toMatchObject({
      followGraphRevision: 1,
      friendsRevision: 0,
    });
  });

  it('advances both revisions for a friendship change', () => {
    useStreamInvalidationStore.getState().invalidateFollowDependentStreams({ includeFriends: true });
    useStreamInvalidationStore.getState().invalidateFollowDependentStreams({ includeFriends: true });

    expect(useStreamInvalidationStore.getState()).toMatchObject({
      followGraphRevision: 2,
      friendsRevision: 2,
    });
  });
});
