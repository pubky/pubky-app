import * as Core from '@/core';

/**
 * Controller for homegate operations.
 * Entry point for homegate features, called from UI components.
 */
export class HomegateController {
  private constructor() {}

  /**
   * Get SMS verification availability info.
   *
   * @returns The availability status
   * @throws AppError if retrieval fails
   */
  static async getSmsVerificationInfo(): Promise<Core.THomegateSmsInfoResult> {
    return await Core.HomegateApplication.getSmsVerificationInfo();
  }

  /**
   * Get Lightning Network verification availability and price.
   *
   * @returns The availability status and price if available
   * @throws AppError if retrieval fails
   */
  static async getLnVerificationInfo(): Promise<Core.THomegateLnInfoResult> {
    return await Core.HomegateApplication.getLnVerificationInfo();
  }

  /**
   * Create a new Lightning Network verification request.
   *
   * @returns The verification details including the BOLT11 invoice
   * @throws AppError if creation fails
   */
  static async createLnVerification(): Promise<Core.THomegateCreateLnVerificationResult> {
    return await Core.HomegateApplication.createLnVerification();
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
  ): Promise<Core.THomegateAwaitLnVerificationResult> {
    if (signal) {
      return await Core.HomegateApplication.awaitLnVerification(verificationId, signal);
    }
    return await Core.HomegateApplication.awaitLnVerification(verificationId);
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
  }: Core.THomegateVerifySmsCodeParams): Promise<Core.THomegateVerifySmsCodeResult> {
    return await Core.HomegateApplication.verifySmsCode({ phoneNumber, code });
  }

  /**
   * Send an SMS verification code to a phone number.
   *
   * @param phoneNumber - The phone number to send the code to
   * @returns The result of the SMS send request
   * @throws AppError if sending fails
   */
  static async sendSmsCode(phoneNumber: string): Promise<Core.THomegateSendSmsCodeResult> {
    return await Core.HomegateApplication.sendSmsCode(phoneNumber);
  }

  /**
   * Get the current BTC/USD and SAT/USD exchange rate.
   *
   * @returns The BTC rate with satUsd, btcUsd, and lastUpdatedAt
   * @throws AppError if retrieval fails
   */
  static async getBtcRate(): Promise<Core.BtcRate> {
    return await Core.HomegateApplication.getBtcRate();
  }
}
