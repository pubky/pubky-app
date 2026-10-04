import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRuntimeConfigForTests, RUNTIME_CONFIG_WINDOW_KEY } from '@/libs/runtime-config/runtime-config';
import { getProfileLocalEditTtlMs } from './user';

describe('getProfileLocalEditTtlMs', () => {
  beforeEach(() => {
    delete window[RUNTIME_CONFIG_WINDOW_KEY];
    vi.stubEnv('PUBKY_RUNTIME_PROFILE_LOCAL_EDIT_TTL_MS', undefined);
    resetRuntimeConfigForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetRuntimeConfigForTests();
  });

  it('defaults to five minutes', () => {
    expect(getProfileLocalEditTtlMs()).toBe(300_000);
  });

  it('allows a deployer to extend protection beyond the normal user TTL', () => {
    vi.stubEnv('PUBKY_RUNTIME_PROFILE_LOCAL_EDIT_TTL_MS', '1800000');
    vi.stubEnv('PUBKY_RUNTIME_TTL_USER_MS', '60000');
    expect(getProfileLocalEditTtlMs()).toBe(1_800_000);
  });
});
