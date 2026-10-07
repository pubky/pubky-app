import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPassportConfigured } from '@/config/network';
import { Logger } from '@/libs/logger/logger';
import { resetPassportEligibilityWarningForTests, usePassportEligibility } from './usePassportEligibility';

vi.mock('@/config/network', () => ({
  isPassportConfigured: vi.fn(),
}));

const mockIsPassportConfigured = vi.mocked(isPassportConfigured);
const originalLocation = window.location;

function setProtocol(protocol: 'https:' | 'http:') {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, protocol, origin: `${protocol}//localhost:3000` },
  });
}

describe('usePassportEligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPassportEligibilityWarningForTests();
    mockIsPassportConfigured.mockReturnValue(true);
    vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    vi.restoreAllMocks();
  });

  it('starts pending and resolves to enabled on an HTTPS page when configured', () => {
    setProtocol('https:');
    let firstRenderValue: string | undefined;

    const { result } = renderHook(() => {
      const value = usePassportEligibility();
      firstRenderValue ??= value;
      return value;
    });

    // First render (what the server also produces) must be pending so hydration matches.
    expect(firstRenderValue).toBe('pending');
    expect(result.current).toBe('enabled');
    expect(Logger.warn).not.toHaveBeenCalled();
  });

  it('resolves to disabled on a plain HTTP page and warns exactly once', () => {
    setProtocol('http:');

    const first = renderHook(() => usePassportEligibility());
    expect(first.result.current).toBe('disabled');

    first.rerender();
    const second = renderHook(() => usePassportEligibility());
    expect(second.result.current).toBe('disabled');

    expect(Logger.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Logger.warn).mock.calls[0]?.[0]).toContain('dev:https');
  });

  it('resolves to disabled without warning when no Passport origin is configured', () => {
    setProtocol('http:');
    mockIsPassportConfigured.mockReturnValue(false);

    const { result } = renderHook(() => usePassportEligibility());

    expect(result.current).toBe('disabled');
    expect(Logger.warn).not.toHaveBeenCalled();
  });
});
