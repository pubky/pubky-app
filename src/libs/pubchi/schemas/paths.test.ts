import { describe, expect, it } from 'vitest';
import { delegationPath } from './delegation';
import { isAllowlistedPath, PATHS } from './paths';

describe('Pubchi v1 paths', () => {
  it('allowlists the new namespace and rejects the old namespace', () => {
    expect(isAllowlistedPath(PATHS.config)).toBe(true);
    expect(isAllowlistedPath('/pub/app.pubchi/v1/feeds/feed-1.json')).toBe(true);
    expect(isAllowlistedPath(`/pub/${'pubchi' + '.app'}/config.json`)).toBe(false);
    expect(isAllowlistedPath(`/pub/${'pubchi' + '.app'}/feeds/feed-1.json`)).toBe(false);
  });

  it('allowlists device delegation paths', () => {
    expect(isAllowlistedPath(delegationPath('x'))).toBe(true);
  });

  it('rejects invalid bot and device identifiers', () => {
    expect(isAllowlistedPath('/pub/app.pubchi/v1/bots/not%20valid.json')).toBe(false);
    expect(isAllowlistedPath('/pub/app.pubchi/v1/devices/not%20valid.json')).toBe(false);
  });
});
