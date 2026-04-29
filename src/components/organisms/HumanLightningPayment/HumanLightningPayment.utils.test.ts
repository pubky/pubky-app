import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VerificationHandler } from './HumanLightningPayment.utils';
import { asOpaque } from '@/test-utils';
import { HomegateController } from '@/controllers/homegate/homegate';
type VerificationHandlerInternals = { checkPaymentStatus: () => Promise<void> };

vi.mock('@/controllers/homegate/homegate', () => ({
  HomegateController: {
    createLnVerification: vi.fn(),
    awaitLnVerification: vi.fn(),
  },
}));

const DEFAULT_VERIFICATION_DATA = {
  id: 'test-verification-id',
  bolt11Invoice: 'lnbc1000...',
  amountSat: 1000,
  expiresAt: Date.now() + 600000,
};

describe('VerificationHandler', () => {
  const flushMicrotasks = async (iterations = 5) => {
    for (let i = 0; i < iterations; i += 1) {
      await Promise.resolve();
    }
  };

  /** Creates a promise that stays pending until the given signal is aborted. */
  const makeAbortablePendingResult = (signal?: AbortSignal) =>
    new Promise<{ success: false; timeout: true }>((resolve) => {
      if (signal?.aborted) {
        resolve({ success: false, timeout: true });
        return;
      }
      signal?.addEventListener(
        'abort',
        () => {
          resolve({ success: false, timeout: true });
        },
        { once: true },
      );
    });

  const mockCreateLnVerification = HomegateController.createLnVerification as ReturnType<typeof vi.fn>;
  const mockAwaitLnVerification = HomegateController.awaitLnVerification as ReturnType<typeof vi.fn>;
  const createHandlerInstance = (
    overrides: Partial<{
      data: { id: string; bolt11Invoice: string; amountSat: number; expiresAt: number };
      onPaymentConfirmed: (signupCode: string, homeserverPubky: string) => void;
      onPaymentExpired: () => void;
      onError: (error: unknown) => void;
    }> = {},
  ) => {
    const VerificationHandlerCtor =
      asOpaque<
        new (
          data: { id: string; bolt11Invoice: string; amountSat: number; expiresAt: number },
          onPaymentConfirmed: (signupCode: string, homeserverPubky: string) => void,
          onPaymentExpired: () => void,
          onError?: (error: unknown) => void,
        ) => VerificationHandler
      >(VerificationHandler);

    return new VerificationHandlerCtor(
      overrides.data ?? DEFAULT_VERIFICATION_DATA,
      overrides.onPaymentConfirmed ?? vi.fn(),
      overrides.onPaymentExpired ?? vi.fn(),
      overrides.onError,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateLnVerification.mockResolvedValue(DEFAULT_VERIFICATION_DATA);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('visibility change handling (mobile background/foreground)', () => {
    it('aborts stale in-flight poll on visibility and runs a single immediate recovery check', async () => {
      let callCount = 0;
      mockAwaitLnVerification.mockImplementation(async (_verificationId: string, signal?: AbortSignal) => {
        callCount += 1;
        if (callCount === 1) {
          return makeAbortablePendingResult(signal);
        }

        return {
          success: true,
          data: {
            isPaid: true,
            signupCode: 'signup-code-123',
            homeserverPubky: 'homeserver-pubky-456',
          },
        };
      });

      const onPaymentConfirmed = vi.fn();
      const onPaymentExpired = vi.fn();

      const handler = await VerificationHandler.create(onPaymentConfirmed, onPaymentExpired, vi.fn());

      await flushMicrotasks();

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      await flushMicrotasks();
      expect(mockAwaitLnVerification).toHaveBeenCalledTimes(2);
      const firstCallSignal = mockAwaitLnVerification.mock.calls[0]?.[1] as AbortSignal | undefined;
      expect(firstCallSignal?.aborted).toBe(true);
      expect(onPaymentConfirmed).not.toHaveBeenCalled();

      handler.abort();
    });

    it('debounces repeated visibility events to avoid recovery request bursts', async () => {
      mockAwaitLnVerification.mockImplementation(async (_verificationId: string, signal?: AbortSignal) => {
        return makeAbortablePendingResult(signal);
      });

      const handler = await VerificationHandler.create(vi.fn(), vi.fn(), vi.fn());
      await flushMicrotasks();

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });

      document.dispatchEvent(new Event('visibilitychange'));
      await flushMicrotasks(10);
      expect(mockAwaitLnVerification).toHaveBeenCalledTimes(2);
      const callsAfterFirstVisibility = mockAwaitLnVerification.mock.calls.length;

      // Should be ignored by debounce window (750ms) and not trigger a new recovery call.
      document.dispatchEvent(new Event('visibilitychange'));
      await flushMicrotasks(10);
      expect(mockAwaitLnVerification.mock.calls.length).toBe(callsAfterFirstVisibility);

      handler.abort();
    });

    it('retries when await endpoint is rate limited and eventually confirms payment', async () => {
      vi.useFakeTimers();
      try {
        mockAwaitLnVerification
          .mockResolvedValueOnce({
            success: false,
            rateLimited: true,
            retryAfter: 1,
          })
          .mockResolvedValueOnce({
            success: true,
            data: {
              isPaid: true,
              signupCode: 'signup-code-123',
              homeserverPubky: 'homeserver-pubky-456',
            },
          });

        const onPaymentConfirmed = vi.fn();
        const handler = await VerificationHandler.create(onPaymentConfirmed, vi.fn(), vi.fn());

        await vi.advanceTimersByTimeAsync(1000);
        await flushMicrotasks();

        expect(onPaymentConfirmed).toHaveBeenCalledWith('signup-code-123', 'homeserver-pubky-456');
        handler.abort();
      } finally {
        vi.useRealTimers();
      }
    });

    it('uses jittered exponential backoff when rate-limited without retryAfter', async () => {
      vi.useFakeTimers();
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
      try {
        mockAwaitLnVerification
          .mockResolvedValueOnce({
            success: false,
            rateLimited: true,
          })
          .mockResolvedValueOnce({
            success: true,
            data: {
              isPaid: true,
              signupCode: 'signup-code-123',
              homeserverPubky: 'homeserver-pubky-456',
            },
          });

        const onPaymentConfirmed = vi.fn();
        const handler = await VerificationHandler.create(onPaymentConfirmed, vi.fn(), vi.fn());

        await vi.advanceTimersByTimeAsync(249);
        expect(onPaymentConfirmed).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        await flushMicrotasks();
        expect(onPaymentConfirmed).toHaveBeenCalledWith('signup-code-123', 'homeserver-pubky-456');

        handler.abort();
      } finally {
        randomSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it('should only call onPaymentConfirmed once even if both polling and visibility check detect payment', async () => {
      // Both the long-poll and visibility check return payment confirmed simultaneously
      mockAwaitLnVerification.mockResolvedValue({
        success: true,
        data: {
          isPaid: true,
          signupCode: 'signup-code-123',
          homeserverPubky: 'homeserver-pubky-456',
        },
      });

      const onPaymentConfirmed = vi.fn();
      const onPaymentExpired = vi.fn();

      const handler = await VerificationHandler.create(onPaymentConfirmed, onPaymentExpired);

      // Trigger visibility change while polling is also running
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      await flushMicrotasks();

      // Should only be called once, not twice
      expect(onPaymentConfirmed).toHaveBeenCalledTimes(1);

      handler.abort();
    });

    it('surfaces non-retryable await errors through onError callback', async () => {
      const fatalError = new Error('fatal await failure');
      mockAwaitLnVerification.mockRejectedValue(fatalError);

      const onError = vi.fn();
      const handler = await VerificationHandler.create(vi.fn(), vi.fn(), onError);

      await flushMicrotasks();

      expect(onError).toHaveBeenCalledWith(fatalError);
      expect(handler.aborted).toBe(true);
    });

    it('should clean up visibility listener on abort', async () => {
      mockAwaitLnVerification.mockImplementation(async () => new Promise(() => {}));

      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const handler = await VerificationHandler.create(vi.fn(), vi.fn());
      await flushMicrotasks();

      const signal = mockAwaitLnVerification.mock.calls[0]?.[1] as AbortSignal | undefined;
      handler.abort();

      expect(signal?.aborted).toBe(true);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });
  });

  describe('payment expiry guards', () => {
    it('should not fire onPaymentExpired after payment is confirmed', async () => {
      vi.useFakeTimers();
      try {
        // Verification expires in 500ms
        mockCreateLnVerification.mockResolvedValue({
          id: 'test-verification-id',
          bolt11Invoice: 'lnbc1000...',
          amountSat: 1000,
          expiresAt: Date.now() + 500,
        });

        // Payment confirmed immediately on first poll
        mockAwaitLnVerification.mockResolvedValue({
          success: true,
          data: {
            isPaid: true,
            signupCode: 'signup-code-123',
            homeserverPubky: 'homeserver-pubky-456',
          },
        });

        const onPaymentConfirmed = vi.fn();
        const onPaymentExpired = vi.fn();

        const handler = await VerificationHandler.create(onPaymentConfirmed, onPaymentExpired, vi.fn());

        await flushMicrotasks();
        expect(onPaymentConfirmed).toHaveBeenCalledTimes(1);

        // Advance past expiry — onPaymentExpired should NOT fire because payment was already confirmed
        await vi.advanceTimersByTimeAsync(600);
        expect(onPaymentExpired).not.toHaveBeenCalled();

        handler.abort();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should clean up expiry timeout and visibility listener on payment confirmation', async () => {
      mockAwaitLnVerification.mockResolvedValue({
        success: true,
        data: {
          isPaid: true,
          signupCode: 'signup-code-123',
          homeserverPubky: 'homeserver-pubky-456',
        },
      });

      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      const onPaymentConfirmed = vi.fn();

      const handler = await VerificationHandler.create(onPaymentConfirmed, vi.fn(), vi.fn());
      await flushMicrotasks();

      expect(onPaymentConfirmed).toHaveBeenCalledTimes(1);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

      handler.abort();
    });
  });

  describe('tight-loop protection', () => {
    it('applies backoff when server returns success with isPaid false', async () => {
      vi.useFakeTimers();
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
      try {
        let callCount = 0;
        mockAwaitLnVerification.mockImplementation(async () => {
          callCount += 1;
          if (callCount <= 2) {
            // First two calls return isPaid: false (unexpected fallthrough case)
            return {
              success: true,
              data: {
                isPaid: false,
                homeserverPubky: 'homeserver-pubky-456',
              },
            };
          }
          // Third call returns success
          return {
            success: true,
            data: {
              isPaid: true,
              signupCode: 'signup-code-123',
              homeserverPubky: 'homeserver-pubky-456',
            },
          };
        });

        const onPaymentConfirmed = vi.fn();
        const handler = await VerificationHandler.create(onPaymentConfirmed, vi.fn(), vi.fn());

        // First call happens immediately. With Math.random()=0 and jitter factor 0.5,
        // first backoff = floor(500 * 0.5) = 250ms
        await flushMicrotasks();
        expect(callCount).toBe(1);
        expect(onPaymentConfirmed).not.toHaveBeenCalled();

        // Advance past first backoff (250ms) — second call should fire
        await vi.advanceTimersByTimeAsync(250);
        await flushMicrotasks();
        expect(callCount).toBe(2);
        expect(onPaymentConfirmed).not.toHaveBeenCalled();

        // Advance past second backoff (500ms with jitter floor) — third call should fire and confirm
        await vi.advanceTimersByTimeAsync(500);
        await flushMicrotasks();
        expect(callCount).toBe(3);
        expect(onPaymentConfirmed).toHaveBeenCalledWith('signup-code-123', 'homeserver-pubky-456');

        handler.abort();
      } finally {
        randomSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });

  describe('abort responsiveness', () => {
    it('should resolve sleep immediately when abort is called during backoff', async () => {
      vi.useFakeTimers();
      try {
        mockAwaitLnVerification
          .mockResolvedValueOnce({
            success: false,
            rateLimited: true,
            retryAfter: 5, // 5 second backoff
          })
          .mockImplementation(async () => new Promise(() => {})); // Never resolves

        const handler = await VerificationHandler.create(vi.fn(), vi.fn(), vi.fn());

        // First poll returns rate-limited, handler enters 5s sleep
        await flushMicrotasks();
        expect(mockAwaitLnVerification).toHaveBeenCalledTimes(1);

        // Abort during sleep — should not need to wait 5 seconds
        handler.abort();
        await flushMicrotasks();

        expect(handler.aborted).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('visibility check retries', () => {
    it('retries immediate visibility check on rate-limit and confirms on retry', async () => {
      vi.useFakeTimers();
      try {
        mockAwaitLnVerification
          .mockResolvedValueOnce({
            success: false,
            rateLimited: true,
            retryAfter: 1,
          })
          .mockResolvedValueOnce({
            success: true,
            data: {
              isPaid: true,
              signupCode: 'signup-code-123',
              homeserverPubky: 'homeserver-pubky-456',
            },
          });

        const onPaymentConfirmed = vi.fn();
        const handler = createHandlerInstance({ onPaymentConfirmed });

        const runCheck = asOpaque<VerificationHandlerInternals>(handler).checkPaymentStatus();
        await flushMicrotasks();
        expect(onPaymentConfirmed).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1000);
        await runCheck;

        expect(onPaymentConfirmed).toHaveBeenCalledWith('signup-code-123', 'homeserver-pubky-456');
      } finally {
        vi.useRealTimers();
      }
    });

    it('stops immediate visibility check when await fails with non-retryable error', async () => {
      const fatalError = new Error('fatal visibility check failure');
      mockAwaitLnVerification.mockRejectedValueOnce(fatalError);

      const onError = vi.fn();
      const handler = createHandlerInstance({ onError });

      await asOpaque<VerificationHandlerInternals>(handler).checkPaymentStatus();

      expect(onError).toHaveBeenCalledWith(fatalError);
      expect(handler.aborted).toBe(true);
    });
  });
});
