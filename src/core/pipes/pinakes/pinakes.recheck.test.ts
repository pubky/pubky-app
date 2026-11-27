import { describe, expect, it } from 'vitest';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import { PinakesStatus } from '@/services/pinakes/pinakes.types';
import { getRecheckDelay, isUnsettledCard } from './pinakes.recheck';

describe('getRecheckDelay', () => {
  it('doubles from 2 s up to 30 s and stops once about two minutes have been waited', () => {
    const delays = Array.from({ length: 10 }, (_, count) => getRecheckDelay(count));
    expect(delays).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000, null, null, null]);
  });
});

describe('isUnsettledCard', () => {
  it('is true for no card and a pending card, false for a read one', () => {
    expect(isUnsettledCard(null)).toBe(true);
    expect(isUnsettledCard(undefined)).toBe(true);
    expect(isUnsettledCard({ ...videoFixture, status: PinakesStatus.PENDING })).toBe(true);
    expect(isUnsettledCard(videoFixture)).toBe(false);
  });
});
