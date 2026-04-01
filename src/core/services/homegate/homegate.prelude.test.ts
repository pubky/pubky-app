import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDispatchSignals = vi.fn();
vi.mock('@prelude.so/js-sdk/signals', () => ({
  dispatchSignals: mockDispatchSignals,
}));

vi.mock('@/libs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs')>();
  return {
    ...actual,
    Env: {
      ...actual.Env,
      NEXT_PUBLIC_PRELUDE_SDK_KEY: 'test-sdk-key',
      NEXT_PUBLIC_PRELUDE_SDK_TIMEOUT_MS: 50,
    },
  };
});

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof global.fetch;

describe('HomegateService Prelude integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('sends SMS code with Prelude dispatchId when available', async () => {
    mockDispatchSignals.mockResolvedValue('test-dispatch-id');
    mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const { HomegateService } = await import('./homegate');
    const result = await HomegateService.sendSmsCode('+1234567890');

    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sms_verification/send_code'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phoneNumber: '+1234567890', dispatchId: 'test-dispatch-id' }),
      }),
    );
  });

  it('sends SMS code without dispatchId when Prelude fails', async () => {
    mockDispatchSignals.mockRejectedValue(new Error('Prelude error'));
    mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const { HomegateService } = await import('./homegate');
    const result = await HomegateService.sendSmsCode('+1234567890');

    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sms_verification/send_code'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phoneNumber: '+1234567890' }),
      }),
    );
  });

  it('sends SMS code without dispatchId when Prelude times out', async () => {
    // Mock dispatchSignals to take longer than the 50ms timeout
    mockDispatchSignals.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('too-late-dispatch-id'), 200)),
    );
    mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const { HomegateService } = await import('./homegate');
    const result = await HomegateService.sendSmsCode('+1234567890');

    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sms_verification/send_code'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phoneNumber: '+1234567890' }),
      }),
    );
  });
});
