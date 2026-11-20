import { describe, expect, it, vi } from 'vitest';
import { isPinakesConfigured, isPinakesReachSetServed } from './pinakes';

const mocks = vi.hoisted(() => ({ pinakesUrl: undefined as string | undefined, reachSet: false }));

vi.mock('@/libs/runtime-config/runtime-config', () => ({
  getPinakesUrl: () => mocks.pinakesUrl,
  getPinakesReachSet: () => mocks.reachSet,
}));

describe('isPinakesConfigured', () => {
  it('is off when PUBKY_RUNTIME_PINAKES_URL is unset', () => {
    mocks.pinakesUrl = undefined;

    expect(isPinakesConfigured()).toBe(false);
  });

  it('is on when a Pinakes origin is configured', () => {
    mocks.pinakesUrl = 'https://pinakes.example.com';

    expect(isPinakesConfigured()).toBe(true);
  });
});

describe('isPinakesReachSetServed', () => {
  it('is on only for a configured Pinakes said to serve reach sets', () => {
    for (const [pinakesUrl, reachSet, served] of [
      [undefined, true, false],
      ['https://pinakes.example.com', false, false],
      ['https://pinakes.example.com', true, true],
    ] as const) {
      mocks.pinakesUrl = pinakesUrl;
      mocks.reachSet = reachSet;

      expect(isPinakesReachSetServed()).toBe(served);
    }
  });
});
