import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomegateController } from '@/controllers/homegate/homegate';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { GET } from './route';

const rate = { satUsd: 0.0005, btcUsd: 50_000, lastUpdatedAt: new Date('2026-09-18T00:00:00.000Z') };

describe('API Route: /api/btc-rate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HomegateController, 'getBtcRate').mockResolvedValue(rate);
  });

  describe('GET', () => {
    it('should return the rate with a date the browser can re-hydrate', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.satUsd).toBe(rate.satUsd);
      expect(data.btcUsd).toBe(rate.btcUsd);
      // `useBtcRate` rebuilds the Date from this field, so the serialized form has to survive the trip.
      expect(new Date(data.lastUpdatedAt).getTime()).toBe(rate.lastUpdatedAt.getTime());
    });

    it('should send the Cache-Control header the CDN caches on', async () => {
      const response = await GET();

      expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
    });

    it('should return the AppError message and status when the rate service fails', async () => {
      vi.spyOn(HomegateController, 'getBtcRate').mockRejectedValue(
        Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'Rate service unavailable', {
          service: ErrorService.Local,
          operation: 'getBtcRate',
          context: { statusCode: HttpStatusCode.SERVICE_UNAVAILABLE },
        }),
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(HttpStatusCode.SERVICE_UNAVAILABLE);
      expect(data.error).toBe('Rate service unavailable');
    });

    it('should hide an unexpected error behind a 500', async () => {
      vi.spyOn(HomegateController, 'getBtcRate').mockRejectedValue(new Error('boom'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(HttpStatusCode.INTERNAL_SERVER_ERROR);
      expect(data.error).toBe('Internal Server Error');
    });
  });
});
