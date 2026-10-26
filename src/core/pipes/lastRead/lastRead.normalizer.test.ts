import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LastReadNormalizer } from '@/pipes/lastRead/lastRead.normalizer';
import { TEST_PUBKY } from '../pipes.test-utils';

describe('LastReadNormalizer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('builds a cursor at now, in milliseconds, in the app namespace', () => {
    expect(LastReadNormalizer.to(TEST_PUBKY.USER_1)).toEqual({
      url: `pubky://${TEST_PUBKY.USER_1}/priv/app.pubky/v1/last_read.json`,
      lastRead: { timestamp: Date.parse('2026-10-01T00:00:00Z') },
    });
  });

  it('spells the 0.x cursor path for the legacy fallback read', () => {
    expect(LastReadNormalizer.buildLegacyUrl(TEST_PUBKY.USER_2)).toBe(
      `pubky://${TEST_PUBKY.USER_2}/pub/pubky.app/last_read`,
    );
  });
});
