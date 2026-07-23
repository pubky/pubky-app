import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRuntimeConfigForTests, RUNTIME_CONFIG_WINDOW_KEY } from '@/libs/runtime-config/runtime-config';
import { NETWORK_RUNTIME_DEFAULTS } from '@/libs/runtime-config/runtime-config.schema';
import { asOpaque } from '@/test-utils/type-assertions';

const mockDispatchSignals = vi.fn();
vi.mock('@prelude.so/js-sdk/signals', () => ({
  dispatchSignals: mockDispatchSignals,
}));

const mockFetch = vi.fn();
global.fetch = asOpaque<typeof global.fetch>(mockFetch);

describe('HomegateService Prelude integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    resetRuntimeConfigForTests();
    window[RUNTIME_CONFIG_WINDOW_KEY] = {
      ...NETWORK_RUNTIME_DEFAULTS,
      preludeSdkKey: 'test-sdk-key',
      preludeSdkTimeoutMs: 50,
    };
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
