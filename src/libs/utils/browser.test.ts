import { describe, expect, it } from 'vitest';
import { isIOSBrowser } from './browser';

describe('browser utils', () => {
  it('detects iPhone user agents', () => {
    expect(
      isIOSBrowser({
        maxTouchPoints: 5,
        platform: 'iPhone',
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
      }),
    ).toBe(true);
  });

  it('detects iPadOS desktop mode', () => {
    expect(
      isIOSBrowser({
        maxTouchPoints: 5,
        platform: 'MacIntel',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
      }),
    ).toBe(true);
  });

  it('does not detect non-touch macOS as iOS', () => {
    expect(
      isIOSBrowser({
        maxTouchPoints: 0,
        platform: 'MacIntel',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
      }),
    ).toBe(false);
  });
});
