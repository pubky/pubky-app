import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Env } from '@/libs/env/env';
import { NetworkErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { ExchangerateService } from './exchangerate';
import { exchangerateQueryClient } from './exchangerate.query-client';

// Helper to build a minimal BlockTank ticker
function createTicker(overrides: Partial<{ symbol: string; lastPrice: string }> = {}) {
  return {
    symbol: 'BTCUSD',
    lastPrice: '87076.00',
    base: 'BTC',
    baseName: 'Bitcoin',
    quote: 'USD',
    quoteName: 'US Dollar',
    currencySymbol: '$',
    currencyFlag: '🇺🇸',
    lastUpdatedAt: Date.now(),
    ...overrides,
  };
}

const mockFetch = vi.fn();

global.fetch = asOpaque<typeof global.fetch>(mockFetch);

beforeEach(() => {
  // Clear the query client cache before each test to avoid stale data
  exchangerateQueryClient.clear();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('ExchangerateService', () => {
  describe('getSatoshiUsdRate', () => {
    it('returns the SAT/USD rate when ticker is present', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            tickers: [createTicker({ lastPrice: '87076.00' })],
          }),
          { status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const rate = await ExchangerateService.getSatoshiUsdRate();

      expect(rate.satUsd).toEqual(0.00087076);
      expect(rate.btcUsd).toEqual(87076.0);
      expect(rate.lastUpdatedAt).toBeInstanceOf(Date);
      expect(mockFetch).toHaveBeenCalledWith(Env.NEXT_PUBLIC_EXCHANGE_RATE_API, { method: 'GET' });
    });

    it('throws RESOURCE_NOT_FOUND when BTCUSD ticker is missing', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            tickers: [createTicker({ symbol: 'BTCEUR' })],
          }),
          { status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } },
        ),
      );

      await expect(ExchangerateService.getSatoshiUsdRate()).rejects.toMatchObject({
        category: ErrorCategory.Server,
        code: ServerErrorCode.INVALID_RESPONSE,
        service: ErrorService.Exchangerate,
        operation: 'getBtcUsdRate',
      });
    });

    it('wraps network errors in a SERVICE_UNAVAILABLE AppError', async () => {
      // Mock must reject consistently for all retry attempts
      mockFetch.mockRejectedValue(new Error('Network down'));

      await expect(ExchangerateService.getSatoshiUsdRate()).rejects.toMatchObject({
        category: ErrorCategory.Network,
        code: NetworkErrorCode.CONNECTION_FAILED,
        service: ErrorService.Exchangerate,
        operation: 'getBtcUsdRate',
      });
    }, 15000); // Extended timeout to allow for retry attempts
  });
});
