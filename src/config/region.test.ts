import { afterEach, describe, expect, it } from 'vitest';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { getRegionPolicy } from './region';

function withRegionModes(value: string | undefined, run: () => void): void {
  const previous = process.env.PUBKY_RUNTIME_REGION_MODES;
  if (value === undefined) delete process.env.PUBKY_RUNTIME_REGION_MODES;
  else process.env.PUBKY_RUNTIME_REGION_MODES = value;
  resetRuntimeConfigForTests();
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.PUBKY_RUNTIME_REGION_MODES;
    else process.env.PUBKY_RUNTIME_REGION_MODES = previous;
    resetRuntimeConfigForTests();
  }
}

describe('getRegionPolicy', () => {
  afterEach(() => resetRuntimeConfigForTests());

  it('holds nothing while PUBKY_RUNTIME_REGION_MODES is unset', () => {
    withRegionModes(undefined, () => {
      expect(getRegionPolicy().holdsPaidUnlocks).toBe(false);
      expect(getRegionPolicy().modeOf('US')).toBe('open');
    });
  });

  it('holds the launch regions from the env value', () => {
    withRegionModes('EU=blocked,GB=blocked,US=blocked', () => {
      const policy = getRegionPolicy();
      expect(policy.holdsPaidUnlocks).toBe(true);
      for (const country of ['DE', 'GB', 'US']) expect(policy.modeOf(country)).toBe('blocked');
      expect(policy.modeOf('CH')).toBe('open');
    });
  });

  it('follows a changed value and reuses the policy while it stays the same', () => {
    withRegionModes('US=blocked', () => {
      const first = getRegionPolicy();
      expect(getRegionPolicy()).toBe(first);
    });
    withRegionModes('none', () => {
      expect(getRegionPolicy().holdsPaidUnlocks).toBe(false);
    });
  });
});
