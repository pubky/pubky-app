import * as Core from '@/core';
import type * as Types from './homegate.types';

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
   * Generates a signup authentication URL for Pubky Ring App
   *
   * @param inviteCode - The invite code for signup
   * @returns Authentication URL and promise to the generated authentication URL
   */
  static async generateSignupAuthUrl(inviteCode: string): Promise<Core.TGenerateAuthUrlResult> {
    return Core.HomeserverService.generateSignupAuthUrl({ inviteCode });
  }

  /**
   * Get SMS verification availability info.
   *
   * @returns The availability status
   * @throws AppError if retrieval fails
   */
  static async getSmsVerificationInfo(): Promise<Types.THomegateSmsInfoResult> {
    return await Core.HomegateService.getSmsVerificationInfo();
  }

  /**
   * Get Lightning Network verification availability and price.
   *
   * @returns The availability status and price if available
   * @throws AppError if retrieval fails
   */
  static async getLnVerificationInfo(): Promise<Types.THomegateLnInfoResult> {
    return await Core.HomegateService.getLnVerificationInfo();
  }

  /**
   * Create a new Lightning Network verification request.
   *
   * @returns The verification details including the BOLT11 invoice
   * @throws AppError if creation fails
   */
  static async createLnVerification(): Promise<Types.THomegateCreateLnVerificationResult> {
    return Core.HomegateService.createLnVerification();
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
  ): Promise<Types.THomegateAwaitLnVerificationResult> {
    if (signal) {
      return Core.HomegateService.awaitLnVerification(verificationId, signal);
    }
    return Core.HomegateService.awaitLnVerification(verificationId);
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
  }: Types.THomegateVerifySmsCodeParams): Promise<Types.THomegateVerifySmsCodeResult> {
    return Core.HomegateService.verifySmsCode({ phoneNumber, code });
  }

  /**
   * Send an SMS verification code to a phone number.
   *
   * @param phoneNumber - The phone number to send the code to
   * @returns The result of the SMS send request
   * @throws AppError if sending fails
   */
  static async sendSmsCode(phoneNumber: string): Promise<Types.THomegateSendSmsCodeResult> {
    return Core.HomegateService.sendSmsCode(phoneNumber);
  }

  /**
   * Get the current BTC/USD and SAT/USD exchange rate.
   *
   * @returns The BTC rate with satUsd, btcUsd, and lastUpdatedAt
   * @throws AppError if retrieval fails
   */
  static async getBtcRate(): Promise<Core.BtcRate> {
    return Core.ExchangerateService.getSatoshiUsdRate();
  }
}
