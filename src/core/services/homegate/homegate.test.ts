import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomegateService } from './homegate';

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof global.fetch;

describe('HomegateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('awaitLnVerification', () => {
    it('returns a rate-limited result for 429 responses', async () => {
      mockFetch.mockResolvedValue(
        new Response(null, {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'retry-after': '7' },
        }),
      );

      const verificationId = '550e8400-e29b-41d4-a716-446655440000';
      const result = await HomegateService.awaitLnVerification(verificationId);

      expect(result).toEqual({
        success: false,
        rateLimited: true,
        retryAfter: 7,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/ln_verification/${verificationId}/await`),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('parses Retry-After when header is an HTTP-date', async () => {
      vi.useFakeTimers();
      try {
        const now = new Date('2026-02-12T12:00:00.000Z');
        vi.setSystemTime(now);

        mockFetch.mockResolvedValue(
          new Response(null, {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'retry-after': new Date(now.getTime() + 3500).toUTCString() },
          }),
        );

        const verificationId = '550e8400-e29b-41d4-a716-446655440000';
        const result = await HomegateService.awaitLnVerification(verificationId);

        expect(result).toEqual({
          success: false,
          rateLimited: true,
          retryAfter: 3,
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('forwards abort signal to fetch when provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(null, {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'retry-after': '1' },
        }),
      );

      const verificationId = '550e8400-e29b-41d4-a716-446655440000';
      const controller = new AbortController();
      await HomegateService.awaitLnVerification(verificationId, controller.signal);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/ln_verification/${verificationId}/await`),
        expect.objectContaining({ method: 'GET', signal: controller.signal }),
      );
    });
  });
});
