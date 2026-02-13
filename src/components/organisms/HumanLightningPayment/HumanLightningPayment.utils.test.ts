import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VerificationHandler } from './HumanLightningPayment.utils';
import { HomegateController } from '@/core';

vi.mock('@/core', async () => {
  const actual = await vi.importActual('@/core');
  return {
    ...actual,
    HomegateController: {
      createLnVerification: vi.fn(),
      awaitLnVerification: vi.fn(),
    },
  };
});

describe('VerificationHandler', () => {
  const flushMicrotasks = async (iterations = 5) => {
    for (let i = 0; i < iterations; i += 1) {
      await Promise.resolve();
    }
  };

  const mockCreateLnVerification = HomegateController.createLnVerification as ReturnType<typeof vi.fn>;
  const mockAwaitLnVerification = HomegateController.awaitLnVerification as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: verification not expired (expires in 10 minutes)
    mockCreateLnVerification.mockResolvedValue({
      id: 'test-verification-id',
      bolt11Invoice: 'lnbc1000...',
      amountSat: 1000,
      expiresAt: Date.now() + 600000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('visibility change handling (mobile background/foreground)', () => {
    it('should avoid sending a second request when visibility check fires during an in-flight poll', async () => {
      mockAwaitLnVerification.mockImplementation(async () => new Promise(() => {}));

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
      expect(mockAwaitLnVerification).toHaveBeenCalledTimes(1);
      expect(onPaymentConfirmed).not.toHaveBeenCalled();

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
});
