import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsActions } from './useSettingsActions';

const { mockSettingsController, mockIsAppError } = vi.hoisted(() => ({
  mockSettingsController: {
    setNotificationPreference: vi.fn(),
    setShowConfirm: vi.fn(),
    setBlurCensored: vi.fn(),
    setSignOutInactive: vi.fn(),
    setRequirePin: vi.fn(),
    setHideWhoToFollow: vi.fn(),
    setHideActiveFriends: vi.fn(),
    setHideSearch: vi.fn(),
    setNeverShowPosts: vi.fn(),
  },
  mockIsAppError: vi.fn(),
}));

vi.mock('@/controllers/settings/settings', () => ({
  SettingsController: mockSettingsController,
}));

vi.mock('@/libs/error/error.utils', () => ({
  isAppError: (...args: unknown[]) => mockIsAppError(...args),
}));

describe('useSettingsActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAppError.mockReturnValue(false);
  });

  it('calls SettingsController.setNotificationPreference', async () => {
    const { result } = renderHook(() => useSettingsActions());

    await act(async () => {
      await result.current.setNotificationPreference('follow', true);
    });

    expect(mockSettingsController.setNotificationPreference).toHaveBeenCalledWith('follow', true);
  });

  it('calls SettingsController.setShowConfirm', async () => {
    const { result } = renderHook(() => useSettingsActions());

    await act(async () => {
      await result.current.setShowConfirm(false);
    });

    expect(mockSettingsController.setShowConfirm).toHaveBeenCalledWith(false);
  });

  it('calls SettingsController.setBlurCensored', async () => {
    const { result } = renderHook(() => useSettingsActions());

    await act(async () => {
      await result.current.setBlurCensored(true);
    });

    expect(mockSettingsController.setBlurCensored).toHaveBeenCalledWith(true);
  });

  it('sets error on failure with AppError message', async () => {
    const error = new Error('sync failed');
    mockSettingsController.setNotificationPreference.mockRejectedValue(error);
    mockIsAppError.mockReturnValue(true);

    const { result } = renderHook(() => useSettingsActions());

    await act(async () => {
      await result.current.setNotificationPreference('follow', true);
    });

    await waitFor(() => {
      expect(result.current.error).toBe('sync failed');
    });
  });

  it('uses generic error message for non-AppError', async () => {
    mockSettingsController.setBlurCensored.mockRejectedValue(new Error('unknown'));
    mockIsAppError.mockReturnValue(false);

    const { result } = renderHook(() => useSettingsActions());

    await act(async () => {
      await result.current.setBlurCensored(true);
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to update settings');
    });
  });

  it('clears error on next action', async () => {
    mockSettingsController.setShowConfirm.mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useSettingsActions());

    await act(async () => {
      await result.current.setShowConfirm(true);
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to update settings');
    });

    // Second call succeeds
    mockSettingsController.setShowConfirm.mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.setShowConfirm(false);
    });

    expect(result.current.error).toBeNull();
  });
});
