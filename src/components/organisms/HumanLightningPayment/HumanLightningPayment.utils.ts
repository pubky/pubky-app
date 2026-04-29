import { TimeoutErrorCode } from '@/libs/error/error.codes';
import { getRetryAfter, isAppError, isRetryable } from '@/libs/error/error.utils';
import type {
  THomegateAwaitLnVerificationResult,
  THomegateCreateLnVerificationResult,
} from '@/application/homegate/homegate.types';
import { HomegateController } from '@/controllers/homegate/homegate';
/**
 * Simple verification handler that manages the verification process and payment confirmation.
 */
export class VerificationHandler {
  private static readonly RETRY_BASE_DELAY_MS = 500;
  private static readonly RETRY_MAX_DELAY_MS = 5000;
  private static readonly RETRY_JITTER_FACTOR = 0.5;
  private static readonly VISIBILITY_CHECK_MAX_RETRIES = 2;
  private static readonly VISIBILITY_RECOVERY_DEBOUNCE_MS = 750;

  public aborted = false;
  private paymentConfirmed = false;
  private paymentExpiredTimeout: NodeJS.Timeout | null = null;
  private visibilityHandler: (() => void) | null = null;
  private awaitLnVerificationPromise: Promise<THomegateAwaitLnVerificationResult> | null = null;
  private awaitLnVerificationAbortController: AbortController | null = null;
  private retryAttempt = 0;
  private sleepTimer: NodeJS.Timeout | null = null;
  private sleepResolve: (() => void) | null = null;
  private ignoreNextAbortError = false;
  private visibilityRecoveryInProgress = false;
  private lastVisibilityRecoveryAt = 0;

  private constructor(
    public readonly data: THomegateCreateLnVerificationResult,
    private readonly onPaymentConfirmed: (signupCode: string, homeserverPubky: string) => void,
    private readonly onPaymentExpired: () => void,
    private readonly onError?: (error: unknown) => void,
  ) {}

  /**
   * Create a new verification handler.
   * @param onPaymentConfirmed Callback for when the payment is confirmed.
   * @param onPaymentExpired Callback for when the payment expires.
   * @returns The verification handler.
   */
  public static async create(
    onPaymentConfirmed: (signupCode: string, homeserverPubky: string) => void,
    onPaymentExpired: () => void,
    onError?: (error: unknown) => void,
  ): Promise<VerificationHandler> {
    const result = await HomegateController.createLnVerification();
    const client = new VerificationHandler(result, onPaymentConfirmed, onPaymentExpired, onError);
    client.listenPaymentConfirmed(); // Fire and forget
    client.listenPaymentExpired(); // Fire and forget
    client.listenVisibilityChange(); // Re-check payment when tab becomes visible
    return client;
  }

  /**
   * If the verification and the lightning invoice have expired.
   */
  get isExpired(): boolean {
    return this.data.expiresAt < Date.now();
  }

  /**
   * Abort the verification polling.
   */
  public abort(): void {
    this.aborted = true;
    if (this.awaitLnVerificationAbortController) {
      this.awaitLnVerificationAbortController.abort();
      this.awaitLnVerificationAbortController = null;
    }
    if (this.paymentExpiredTimeout) {
      clearTimeout(this.paymentExpiredTimeout);
      this.paymentExpiredTimeout = null;
    }
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
      this.sleepResolve?.();
      this.sleepResolve = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  /**
   * Confirm the payment and invoke the callback.
   * Returns true if this call confirmed the payment, false if already confirmed.
   */
  private confirmPayment(signupCode: string, homeserverPubky: string): boolean {
    if (this.paymentConfirmed || this.aborted) return false;
    this.paymentConfirmed = true;
    this.retryAttempt = 0;

    // Clean up: stop expiry timeout and visibility listener after confirmation.
    if (this.paymentExpiredTimeout) {
      clearTimeout(this.paymentExpiredTimeout);
      this.paymentExpiredTimeout = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    this.onPaymentConfirmed?.(signupCode, homeserverPubky);
    return true;
  }

  private getRetryDelayMs(retryAfterSeconds?: number): number {
    if (typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.min(retryAfterSeconds * 1000, VerificationHandler.RETRY_MAX_DELAY_MS);
    }

    const exponentialDelay = Math.min(
      VerificationHandler.RETRY_BASE_DELAY_MS * 2 ** this.retryAttempt,
      VerificationHandler.RETRY_MAX_DELAY_MS,
    );
    this.retryAttempt += 1;

    // Spread retries to reduce synchronized request bursts after rate limiting.
    const jitterFloor = exponentialDelay * VerificationHandler.RETRY_JITTER_FACTOR;
    const jitterRange = exponentialDelay - jitterFloor;
    const jitteredDelay = jitterFloor + Math.random() * jitterRange;
    return Math.max(1, Math.floor(jitteredDelay));
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      this.sleepResolve = resolve;
      this.sleepTimer = setTimeout(() => {
        this.sleepTimer = null;
        this.sleepResolve = null;
        resolve();
      }, ms);
    });
  }

  private resetRetryState(): void {
    this.retryAttempt = 0;
  }

  private async retryWithBackoff(retryAfterSeconds?: number): Promise<void> {
    if (this.aborted) return;
    await this.sleep(this.getRetryDelayMs(retryAfterSeconds));
  }

  private async awaitVerificationStatus(): Promise<THomegateAwaitLnVerificationResult> {
    if (!this.awaitLnVerificationPromise) {
      this.awaitLnVerificationAbortController = new AbortController();
      this.awaitLnVerificationPromise = HomegateController.awaitLnVerification(
        this.data.id,
        this.awaitLnVerificationAbortController.signal,
      ).finally(() => {
        this.awaitLnVerificationPromise = null;
        this.awaitLnVerificationAbortController = null;
      });
    }
    return this.awaitLnVerificationPromise;
  }

  private async abortInFlightAwait(forVisibilityRecovery: boolean): Promise<void> {
    if (!this.awaitLnVerificationPromise || !this.awaitLnVerificationAbortController) {
      return;
    }

    if (forVisibilityRecovery) {
      this.ignoreNextAbortError = true;
    }

    const inFlightPromise = this.awaitLnVerificationPromise;
    this.awaitLnVerificationAbortController.abort();

    try {
      await inFlightPromise;
    } catch {
      // Expected when aborting an in-flight long poll.
    }
  }

  private async handleAwaitError(error: unknown): Promise<boolean> {
    if (this.aborted) return false;

    if (isAppError(error) && error.code === TimeoutErrorCode.REQUEST_ABORTED && this.ignoreNextAbortError) {
      this.ignoreNextAbortError = false;
      return true;
    }

    if (isAppError(error) && isRetryable(error)) {
      await this.retryWithBackoff(getRetryAfter(error));
      return true;
    }

    this.abort();
    this.onError?.(error);
    return false;
  }

  /**
   * Listen for the payment expiration.
   */
  private listenPaymentExpired() {
    if (this.paymentExpiredTimeout) {
      clearTimeout(this.paymentExpiredTimeout);
    }

    this.paymentExpiredTimeout = setTimeout(() => {
      if (this.paymentConfirmed || this.aborted) return;
      this.onPaymentExpired?.();
    }, this.data.expiresAt - Date.now());
  }

  /**
   * Long-polling endpoint that waits for a Lightning Network payment to be confirmed.
   * Returns immediately if payment is already confirmed, undefined if the verification has expired or the polling has been aborted.
   * @returns The signup code and homeserver public key if the payment is successful, undefined if the verification has expired or the payment has not been confirmed yet.
   */
  private async listenPaymentConfirmed() {
    while (!this.aborted) {
      if (this.isExpired) {
        return undefined;
      }

      try {
        const result = await this.awaitVerificationStatus();
        if (result.success && result.data.isPaid && result.data.signupCode) {
          if (this.confirmPayment(result.data.signupCode, result.data.homeserverPubky)) {
            return;
          }
          continue;
        }

        if ('timeout' in result && result.timeout) {
          this.resetRetryState();
          continue;
        }

        if ('rateLimited' in result && result.rateLimited) {
          await this.retryWithBackoff(result.retryAfter);
          continue;
        }

        if ('notFound' in result && result.notFound) {
          // Verification not found - stop polling (this shouldn't happen in normal flow)
          return undefined;
        }

        // Fallthrough: unrecognized result or success with isPaid: false.
        // Apply backoff to prevent tight-loop hammering the server.
        await this.retryWithBackoff();
      } catch (error) {
        const shouldRetry = await this.handleAwaitError(error);
        if (!shouldRetry) {
          return undefined;
        }
      }
    }
    return undefined;
  }

  /**
   * Listen for visibility changes to handle mobile browser background/foreground transitions.
   * When the user switches to a wallet app to pay and returns, re-check payment status immediately.
   */
  private listenVisibilityChange() {
    if (typeof document === 'undefined') return;

    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible' && !this.aborted && !this.isExpired) {
        void this.recoverFromVisibility();
      }
    };

    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private async recoverFromVisibility(): Promise<void> {
    if (this.aborted || this.isExpired || this.paymentConfirmed) return;

    const now = Date.now();
    const isDebounced = now - this.lastVisibilityRecoveryAt < VerificationHandler.VISIBILITY_RECOVERY_DEBOUNCE_MS;
    if (this.visibilityRecoveryInProgress || isDebounced) {
      return;
    }

    this.visibilityRecoveryInProgress = true;
    this.lastVisibilityRecoveryAt = now;

    try {
      // Force-refresh status on foreground by canceling stale in-flight poll first.
      await this.abortInFlightAwait(true);
      await this.checkPaymentStatus();
    } finally {
      this.visibilityRecoveryInProgress = false;
      this.ignoreNextAbortError = false; // Ensure flag never leaks across recovery cycles
    }
  }

  /**
   * Immediately check the payment status without long-polling.
   * Used when the tab becomes visible again after being in the background.
   */
  private async checkPaymentStatus() {
    if (this.aborted || this.isExpired || this.paymentConfirmed) return;

    for (let attempt = 0; attempt <= VerificationHandler.VISIBILITY_CHECK_MAX_RETRIES; attempt += 1) {
      if (this.aborted || this.isExpired || this.paymentConfirmed) return;

      try {
        const result = await this.awaitVerificationStatus();
        if (result.success && result.data.isPaid && result.data.signupCode) {
          this.confirmPayment(result.data.signupCode, result.data.homeserverPubky);
          return;
        }

        if ('rateLimited' in result && result.rateLimited) {
          await this.retryWithBackoff(result.retryAfter);
          continue;
        }

        if ('timeout' in result && result.timeout) {
          this.resetRetryState();
        }
        return;
      } catch (error) {
        const shouldRetry = await this.handleAwaitError(error);
        if (!shouldRetry) {
          return;
        }
      }
    }
  }
}
