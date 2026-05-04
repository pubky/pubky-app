import { EXCHANGE_RATE_API } from '@/config/network';
import { exchangerateQueryClient } from './exchangerate.query-client';
import { BlockTankResponse, BtcRate } from './exchangerate.types';
import { HttpMethod } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpResponseToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';

/**
 * Exchange rate service class.
 * Handles fetching BTC/USD and SAT/USD exchange rates from external APIs.
 */
export class ExchangerateService {
  private constructor() {} // Prevent instantiation

  /**
   * Fetches the BTC/USD exchange rate from BlockTank API
   *
   * @returns Promise resolving to the BTC/USD exchange rate as a number
   * @throws {AppError} If the API request fails, response is invalid, or BTCUSD ticker is not found
   */
  private static async getBtcUsdRate(): Promise<number> {
    const response = await safeFetch(
      EXCHANGE_RATE_API,
      { method: HttpMethod.GET },
      ErrorService.Exchangerate,
      'getBtcUsdRate',
    );

    if (!response.ok) {
      throw httpResponseToError(response, ErrorService.Exchangerate, 'getBtcUsdRate', EXCHANGE_RATE_API);
    }

    const data = await parseResponseOrThrow<BlockTankResponse>(
      response,
      ErrorService.Exchangerate,
      'getBtcUsdRate',
      EXCHANGE_RATE_API,
    );

    if (!data.tickers || !Array.isArray(data.tickers)) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Invalid response format from exchange rate API', {
        service: ErrorService.Exchangerate,
        operation: 'getBtcUsdRate',
        context: { endpoint: EXCHANGE_RATE_API },
      });
    }

    const btcUsdTicker = data.tickers.find((ticker) => ticker.symbol === 'BTCUSD');

    if (!btcUsdTicker) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'BTCUSD ticker not found in API response', {
        service: ErrorService.Exchangerate,
        operation: 'getBtcUsdRate',
        context: { endpoint: EXCHANGE_RATE_API, availableSymbols: data.tickers.map((t) => t.symbol) },
      });
    }

    const rate = parseFloat(btcUsdTicker.lastPrice);

    if (isNaN(rate) || rate <= 0) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, `Invalid exchange rate value: ${btcUsdTicker.lastPrice}`, {
        service: ErrorService.Exchangerate,
        operation: 'getBtcUsdRate',
        context: { endpoint: EXCHANGE_RATE_API, lastPrice: btcUsdTicker.lastPrice },
      });
    }

    return rate;
  }

  /**
   * Gets the current SAT/USD and BTC/USD exchange rate.
   *
   * @returns Promise resolving to the BTC rate with satUsd, btcUsd, and lastUpdatedAt
   * @throws {AppError} If the API request fails, response is invalid, or BTCUSD ticker is not found
   *
   * @example
   * const rate = await ExchangerateService.getSatoshiUsdRate();
   * console.log(`1 SAT = $${rate.satUsd}`);
   */
  static async getSatoshiUsdRate(): Promise<BtcRate> {
    return exchangerateQueryClient.fetchQuery({
      queryKey: ['exchangerate', 'btc-rate'],
      queryFn: async () => {
        const btcusd = await ExchangerateService.getBtcUsdRate();
        return {
          satUsd: btcusd / 100_000_000,
          btcUsd: btcusd,
          lastUpdatedAt: new Date(),
        };
      },
    });
  }
}
