import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenBucket } from './token-bucket';

afterEach(() => vi.useRealTimers());

describe('TokenBucket', () => {
  it('gives its burst at once, then refills at its rate, never past its capacity', () => {
    vi.useFakeTimers();
    const bucket = new TokenBucket(2, 1);
    expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false]);
    vi.advanceTimersByTime(1_000);
    expect([bucket.take(), bucket.take()]).toEqual([true, false]);
    vi.advanceTimersByTime(60_000);
    expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false]);
  });

  it('leaves its reserve to callers that take without one', () => {
    const bucket = new TokenBucket(3, 0);
    expect(bucket.take(2)).toBe(true);
    expect(bucket.take(2)).toBe(false);
    expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false]);
  });
});
