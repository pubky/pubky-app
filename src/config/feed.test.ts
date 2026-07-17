import { describe, expect, it } from 'vitest';
import { isProfileTagReachSupported } from './feed';

describe('profile tag reach policy', () => {
  it.each(['network', 'wot', 'following', 'friends'])('supports %s reach', (reach) => {
    expect(isProfileTagReachSupported(reach)).toBe(true);
  });

  it.each(['all', 'me', 'followers', 'unknown', ''])('rejects %s reach by default', (reach) => {
    expect(isProfileTagReachSupported(reach)).toBe(false);
  });
});
