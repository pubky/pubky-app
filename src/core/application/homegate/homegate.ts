import { ExchangerateService } from '@/services/exchangerate/exchangerate';
import type { BtcRate } from '@/services/exchangerate/exchangerate.types';
import { HomegateService } from '@/services/homegate/homegate';
import type {
  THomegateAwaitLnVerificationResult,
  THomegateCreateLnVerificationResult,
  THomegateLnInfoResult,
  THomegateSendSmsCodeResult,
  THomegateSmsInfoResult,
  THomegateVerifySmsCodeParams,
  THomegateVerifySmsCodeResult,
} from './homegate.types';

/**
 * Homegate application service.
 *
 * Orchestrates homegate workflows:
 * - Lightning Network verification price retrieval
 * - SMS verification
 * - Payment verification
 *
 * This layer is called by the controller and handles business logic orchestration.
 */
export class HomegateApplication {
  private constructor() {}

  /**
   * Get SMS verification availability info.
   *
   * @returns The availability status
   * @throws AppError if retrieval fails
   */
  static async getSmsVerificationInfo(): Promise<THomegateSmsInfoResult> {
    return await HomegateService.getSmsVerificationInfo();
  }

  /**
   * Get Lightning Network verification availability and price.
   *
   * @returns The availability status and price if available
   * @throws AppError if retrieval fails
   */
  static async getLnVerificationInfo(): Promise<THomegateLnInfoResult> {
    return await HomegateService.getLnVerificationInfo();
  }

  /**
   * Create a new Lightning Network verification request.
   *
   * @returns The verification details including the BOLT11 invoice
   * @throws AppError if creation fails
   */
  static async createLnVerification(): Promise<THomegateCreateLnVerificationResult> {
    return HomegateService.createLnVerification();
  }

  /**
   * Await Lightning Network payment confirmation.
   * Long-polling endpoint that waits for payment to be confirmed.
   *
   * @param verificationId - The verification ID from createLnVerification
   * @param signal - Optional abort signal for canceling an in-flight long-poll request
   * @returns The verification result
   * @throws AppError if awaiting fails
   */
  static async awaitLnVerification(
    verificationId: string,
    signal?: AbortSignal,
  ): Promise<THomegateAwaitLnVerificationResult> {
    if (signal) {
      return HomegateService.awaitLnVerification(verificationId, signal);
    }
    return HomegateService.awaitLnVerification(verificationId);
  }

  /**
   * Verify an SMS code for a given phone number.
   *
   * @param params.phoneNumber - The phone number to verify
   * @param params.code - The SMS code to verify
   * @returns The verification result with signup code if valid
   * @throws AppError if verification fails
   */
  static async verifySmsCode({
    phoneNumber,
    code,
  }: THomegateVerifySmsCodeParams): Promise<THomegateVerifySmsCodeResult> {
    return HomegateService.verifySmsCode({ phoneNumber, code });
  }

  /**
   * Send an SMS verification code to a phone number.
   *
   * @param phoneNumber - The phone number to send the code to
   * @returns The result of the SMS send request
   * @throws AppError if sending fails
   */
  static async sendSmsCode(phoneNumber: string): Promise<THomegateSendSmsCodeResult> {
    return HomegateService.sendSmsCode(phoneNumber);
  }

  /**
   * Get the current BTC/USD and SAT/USD exchange rate.
   *
   * @returns The BTC rate with satUsd, btcUsd, and lastUpdatedAt
   * @throws AppError if retrieval fails
   */
  static async getBtcRate(): Promise<BtcRate> {
    return ExchangerateService.getSatoshiUsdRate();
  }
}
