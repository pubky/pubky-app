import { describe, expect, it, vi } from 'vitest';
import { getTtlUserMs } from '@/config/sync';
import { getProfileLocalEditTtlMs, PROFILE_LOCAL_EDIT_TTL_MS } from './user';

vi.mock('@/config/sync', () => ({ getTtlUserMs: vi.fn() }));

describe('getProfileLocalEditTtlMs', () => {
  it('uses the protection window when the user TTL is longer', () => {
    vi.mocked(getTtlUserMs).mockReturnValue(PROFILE_LOCAL_EDIT_TTL_MS * 2);

    expect(getProfileLocalEditTtlMs()).toBe(PROFILE_LOCAL_EDIT_TTL_MS);
  });

  it('never outlasts a shorter user TTL', () => {
    vi.mocked(getTtlUserMs).mockReturnValue(60_000);

    expect(getProfileLocalEditTtlMs()).toBe(60_000);
  });
});
