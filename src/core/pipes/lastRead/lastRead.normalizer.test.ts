import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { LastReadNormalizer } from '@/pipes/lastRead/lastRead.normalizer';

describe('LastReadNormalizer', () => {
  const owner = fakeOwner(1) as Pubky;
  const other = fakeOwner(2) as Pubky;

  describe('URLs', () => {
    it('puts the v1 cursor in the app private namespace', () => {
      expect(LastReadNormalizer.buildUrl(owner)).toBe(`pubky://${owner}/priv/app.pubky/v1/last_read.json`);
    });

    it('spells the 0.x cursor where a 0.x client wrote it', () => {
      expect(LastReadNormalizer.buildLegacyUrl(owner)).toBe(`pubky://${owner}/pub/pubky.app/last_read`);
    });

    it('builds each owner its own URLs', () => {
      expect(LastReadNormalizer.buildUrl(other)).toContain(other);
      expect(LastReadNormalizer.buildUrl(other)).not.toBe(LastReadNormalizer.buildUrl(owner));
    });
  });

  describe('to', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(1_700_000_000_000);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('builds a cursor at the current time, in milliseconds, at the v1 URL', () => {
      expect(LastReadNormalizer.to(owner)).toEqual({
        url: `pubky://${owner}/priv/app.pubky/v1/last_read.json`,
        lastRead: { timestamp: 1_700_000_000_000 },
      });
    });

    it('follows the clock between calls', () => {
      const first = LastReadNormalizer.to(owner);
      vi.setSystemTime(1_700_000_000_010);

      expect(LastReadNormalizer.to(owner).lastRead.timestamp).toBe(first.lastRead.timestamp + 10);
    });

    it('is the plain JSON document the homeserver stores', () => {
      expect(JSON.parse(JSON.stringify(LastReadNormalizer.to(owner).lastRead))).toEqual({
        timestamp: 1_700_000_000_000,
      });
    });
  });
});
