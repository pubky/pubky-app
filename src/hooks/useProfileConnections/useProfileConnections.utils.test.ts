import { describe, expect, it } from 'vitest';
import { getConnectionsHeadingCount } from './useProfileConnections.utils';

describe('getConnectionsHeadingCount', () => {
  it('uses the profile total while pages remain', () => {
    expect(getConnectionsHeadingCount({ total: 30, loaded: 20, retained: 0, hasMore: true, failed: false })).toBe(30);
  });

  it('never shows fewer than the loaded rows while pages remain', () => {
    expect(getConnectionsHeadingCount({ total: 5, loaded: 20, retained: 0, hasMore: true, failed: false })).toBe(20);
  });

  it('keeps the profile total when a later page failed to load', () => {
    expect(getConnectionsHeadingCount({ total: 25, loaded: 10, retained: 0, hasMore: false, failed: true })).toBe(25);
  });

  it('uses the loaded rows of an exhausted list over a stale higher total', () => {
    expect(getConnectionsHeadingCount({ total: 3, loaded: 2, retained: 0, hasMore: false, failed: false })).toBe(2);
  });

  it('uses the loaded rows of an exhausted list over a stale lower total', () => {
    expect(getConnectionsHeadingCount({ total: 2, loaded: 3, retained: 0, hasMore: false, failed: false })).toBe(3);
  });

  it('does not count rows kept on screen after an unfollow', () => {
    expect(getConnectionsHeadingCount({ total: 1, loaded: 2, retained: 1, hasMore: false, failed: false })).toBe(1);
  });

  it('does not count retained rows while pages remain', () => {
    expect(getConnectionsHeadingCount({ total: 5, loaded: 20, retained: 2, hasMore: true, failed: false })).toBe(18);
  });
});
