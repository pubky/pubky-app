import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SW_UPDATE_CHECK_MIN_INTERVAL_MS } from '@/config/pwa';

vi.mock('@/molecules/Toaster/toast');

type Listener = (event: Record<string, unknown>) => void;

function createSerwistStub() {
  const listeners = new Map<string, Set<Listener>>();
  const stub = {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    }),
    register: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    messageSkipWaiting: vi.fn(),
    emit(type: string, event: Record<string, unknown> = {}) {
      act(() => {
        listeners.get(type)?.forEach((listener) => listener({ type, ...event }));
      });
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
  return stub;
}

type SerwistStub = ReturnType<typeof createSerwistStub>;

function installSerwist(stub: SerwistStub | undefined) {
  Object.defineProperty(window, 'serwist', { configurable: true, value: stub, writable: true });
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

async function loadHook() {
  // The update-check throttle is module state: reload the module so every test starts fresh.
  // The toast mock is re-imported alongside it so assertions see the instance the hook uses.
  vi.resetModules();
  const [{ useServiceWorkerUpdate }, { toast }] = await Promise.all([
    import('./useServiceWorkerUpdate'),
    import('@/molecules/Toaster/toast'),
  ]);
  return { useServiceWorkerUpdate, toast: vi.mocked(toast) };
}

describe('useServiceWorkerUpdate', () => {
  const reload = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload } });
    reload.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    installSerwist(undefined);
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });

  it('is a no-op when window.serwist is undefined', async () => {
    installSerwist(undefined);
    const { useServiceWorkerUpdate, toast } = await loadHook();

    renderHook(() => useServiceWorkerUpdate());

    expect(toast).not.toHaveBeenCalled();
  });

  it('only listens: registration belongs to ServiceWorkerRegistrationProvider', async () => {
    const serwist = createSerwistStub();
    installSerwist(serwist);
    const { useServiceWorkerUpdate } = await loadHook();

    const first = renderHook(() => useServiceWorkerUpdate());
    first.unmount();
    renderHook(() => useServiceWorkerUpdate());

    expect(serwist.register).not.toHaveBeenCalled();
    expect(serwist.listenerCount('waiting')).toBe(1);
    expect(serwist.listenerCount('controlling')).toBe(1);
  });

  it('shows a persistent update toast whose action skips waiting', async () => {
    const serwist = createSerwistStub();
    installSerwist(serwist);
    const { useServiceWorkerUpdate, toast } = await loadHook();
    renderHook(() => useServiceWorkerUpdate());

    serwist.emit('waiting', { sw: { state: 'installed' } });

    expect(toast).toHaveBeenCalledTimes(1);
    const options = toast.mock.calls[0][0];
    expect(options).toMatchObject({ variant: 'info', title: 'Update available', persistent: true });
    options.action?.onClick();
    expect(serwist.messageSkipWaiting).toHaveBeenCalledTimes(1);
  });

  it('reloads when an updated worker takes control, not on first install', async () => {
    const serwist = createSerwistStub();
    installSerwist(serwist);
    const { useServiceWorkerUpdate } = await loadHook();
    renderHook(() => useServiceWorkerUpdate());

    serwist.emit('controlling', { isUpdate: false });
    expect(reload).not.toHaveBeenCalled();

    serwist.emit('controlling', { isUpdate: true });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('re-surfaces the toast and re-checks for updates when the tab becomes visible', async () => {
    vi.useFakeTimers();
    const serwist = createSerwistStub();
    installSerwist(serwist);
    const { useServiceWorkerUpdate, toast } = await loadHook();
    renderHook(() => useServiceWorkerUpdate());
    serwist.emit('waiting', { sw: { state: 'installed' } });
    expect(toast).toHaveBeenCalledTimes(1);

    // Too soon after mount: no update() call, but the toast comes back.
    setVisibility('visible');
    expect(toast).toHaveBeenCalledTimes(2);
    expect(serwist.update).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SW_UPDATE_CHECK_MIN_INTERVAL_MS);
    setVisibility('visible');
    expect(serwist.update).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    expect(toast).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('removes its listeners on unmount', async () => {
    const serwist = createSerwistStub();
    installSerwist(serwist);
    const { useServiceWorkerUpdate } = await loadHook();
    const { unmount } = renderHook(() => useServiceWorkerUpdate());

    unmount();

    expect(serwist.listenerCount('waiting')).toBe(0);
    expect(serwist.listenerCount('controlling')).toBe(0);
  });
});
