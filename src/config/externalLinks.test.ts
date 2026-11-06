import { describe, expect, it } from 'vitest';
import { buildAppReleaseUrl, getPubkyProtocolLink } from './externalLinks';

describe('buildAppReleaseUrl', () => {
  it('prefixes the package version with v to match GitHub release tags', () => {
    expect(buildAppReleaseUrl('1.10.0')).toBe('https://github.com/pubky/pubky-app/releases/tag/v1.10.0');
  });

  it('does not double-prefix a version that already includes v', () => {
    expect(buildAppReleaseUrl('v1.10.0')).toBe('https://github.com/pubky/pubky-app/releases/tag/v1.10.0');
  });
});

describe('getPubkyProtocolLink', () => {
  it('points at the Pubky protocol site by default', () => {
    expect(getPubkyProtocolLink()).toBe('https://pubky.org');
  });
});
