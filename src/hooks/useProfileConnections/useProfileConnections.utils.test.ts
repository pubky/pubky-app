import { describe, expect, it } from 'vitest';
import { CONNECTION_TYPE } from './useProfileConnections.types';
import { getConnectionsHeadingCount } from './useProfileConnections.utils';

describe('getConnectionsHeadingCount', () => {
  it('uses the profile total while pages remain', () => {
    expect(
      getConnectionsHeadingCount({
        type: CONNECTION_TYPE.FOLLOWERS,
        total: 30,
        loaded: 20,
        hasMore: true,
        isOwnProfile: false,
      }),
    ).toBe(30);
  });

  it('never shows fewer than the loaded rows while pages remain', () => {
    expect(
      getConnectionsHeadingCount({
        type: CONNECTION_TYPE.FOLLOWING,
        total: 5,
        loaded: 20,
        hasMore: true,
        isOwnProfile: false,
      }),
    ).toBe(20);
  });

  it.each([CONNECTION_TYPE.FOLLOWERS, CONNECTION_TYPE.FOLLOWING, CONNECTION_TYPE.FRIENDS])(
    'uses the loaded rows of an exhausted %s list over a stale higher total',
    (type) => {
      expect(getConnectionsHeadingCount({ type, total: 3, loaded: 2, hasMore: false, isOwnProfile: false })).toBe(2);
    },
  );

  it('uses the loaded rows of the own Followers list once exhausted', () => {
    expect(
      getConnectionsHeadingCount({
        type: CONNECTION_TYPE.FOLLOWERS,
        total: 3,
        loaded: 2,
        hasMore: false,
        isOwnProfile: true,
      }),
    ).toBe(2);
  });

  it.each([CONNECTION_TYPE.FOLLOWING, CONNECTION_TYPE.FRIENDS])(
    'uses the total for the own exhausted %s list, which keeps unfollowed rows on screen',
    (type) => {
      expect(getConnectionsHeadingCount({ type, total: 1, loaded: 2, hasMore: false, isOwnProfile: true })).toBe(1);
    },
  );
});
