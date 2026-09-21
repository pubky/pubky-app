import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markInstallReminderDone } from '@/libs/pwa/installReminder';
import { useInstallPromptLifecycle } from './useInstallPromptLifecycle';

const mocks = vi.hoisted(() => ({
  currentUserPubky: 'pk:alice' as string | null,
  snapshot: { canPrompt: false, installed: false },
  listeners: new Set<() => void>(),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn((selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mocks.currentUserPubky }),
  ),
}));

vi.mock('@/libs/pwa/installPrompt', () => ({
  getInstallPromptSnapshot: () => mocks.snapshot,
  getServerInstallPromptSnapshot: () => ({ canPrompt: false, installed: false }),
  subscribeToInstallPrompt: (listener: () => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
}));

vi.mock('@/libs/pwa/installReminder', () => ({
  markInstallReminderDone: vi.fn(),
}));

function publish(next: { canPrompt: boolean; installed: boolean }) {
  act(() => {
    mocks.snapshot = next;
    mocks.listeners.forEach((listener) => listener());
  });
}

describe('useInstallPromptLifecycle', () => {
  beforeEach(() => {
    mocks.currentUserPubky = 'pk:alice';
    mocks.snapshot = { canPrompt: false, installed: false };
    mocks.listeners.clear();
  });

  it('does nothing until the app is installed', () => {
    renderHook(() => useInstallPromptLifecycle());
    publish({ canPrompt: true, installed: false });

    expect(markInstallReminderDone).not.toHaveBeenCalled();
  });

  it('retires the install reminder for the signed-in user once installed', () => {
    renderHook(() => useInstallPromptLifecycle());
    publish({ canPrompt: false, installed: true });

    expect(markInstallReminderDone).toHaveBeenCalledWith('pk:alice');
  });

  it('does not touch storage for a guest', () => {
    mocks.currentUserPubky = null;
    renderHook(() => useInstallPromptLifecycle());
    publish({ canPrompt: false, installed: true });

    expect(markInstallReminderDone).not.toHaveBeenCalled();
  });
});
