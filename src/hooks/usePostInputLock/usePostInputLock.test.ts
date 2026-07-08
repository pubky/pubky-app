import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePostInputLock } from './usePostInputLock';

describe('usePostInputLock', () => {
  it('exposes no lock switch when disabled', () => {
    const { result } = renderHook(() => usePostInputLock({ isEnabled: false }));
    expect(result.current.lockSwitch).toBeUndefined();
    expect(result.current.isLockDialogOpen).toBe(false);
  });

  it('opens the dialog the moment the switch is turned on', () => {
    const { result } = renderHook(() => usePostInputLock({ isEnabled: true }));

    act(() => result.current.lockSwitch?.onCheckedChange(true));

    expect(result.current.isLockDialogOpen).toBe(true);
    expect(result.current.lockSwitch?.checked).toBe(true);
  });

  it('closes the dialog when the switch is turned off', () => {
    const { result } = renderHook(() => usePostInputLock({ isEnabled: true }));

    act(() => result.current.lockSwitch?.onCheckedChange(true));
    act(() => result.current.lockSwitch?.onCheckedChange(false));

    expect(result.current.isLockDialogOpen).toBe(false);
    expect(result.current.lockSwitch?.checked).toBe(false);
  });

  it('reverts the switch when the dialog is dismissed without applying', () => {
    const { result } = renderHook(() => usePostInputLock({ isEnabled: true }));

    act(() => result.current.lockSwitch?.onCheckedChange(true));
    act(() => result.current.closeLockDialog());

    expect(result.current.isLockDialogOpen).toBe(false);
    expect(result.current.lockSwitch?.checked).toBe(false);
  });

  it('closes the dialog, resets the switch, and reports success after publishing', () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => usePostInputLock({ isEnabled: true, onSuccess }));

    act(() => result.current.lockSwitch?.onCheckedChange(true));
    act(() => result.current.handleLockPublished());

    expect(result.current.isLockDialogOpen).toBe(false);
    expect(result.current.lockSwitch?.checked).toBe(false);
    expect(onSuccess).toHaveBeenCalledWith('');
  });
});
