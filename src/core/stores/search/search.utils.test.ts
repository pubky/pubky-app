import { describe, expect, it } from 'vitest';
import { REACH } from '@/stores/home/home.types';
import { getSearchNexusReach } from './search.utils';

describe('getSearchNexusReach', () => {
  it('sends no reach for All', () => {
    expect(getSearchNexusReach(REACH.ALL)).toBeUndefined();
  });

  it.each([
    [REACH.NETWORK, 'wot'],
    [REACH.FOLLOWING, 'following'],
    [REACH.FRIENDS, 'friends'],
  ] as const)('maps %s to the %s Nexus reach', (reach, nexusReach) => {
    expect(getSearchNexusReach(reach)).toBe(nexusReach);
  });
});
