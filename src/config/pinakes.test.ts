import { describe, expect, it, vi } from 'vitest';
import { isPinakesConfigured } from './pinakes';

const mocks = vi.hoisted(() => ({ pinakesUrl: undefined as string | undefined }));

vi.mock('@/libs/runtime-config/runtime-config', () => ({ getPinakesUrl: () => mocks.pinakesUrl }));

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
