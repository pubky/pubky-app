import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SW_UPDATE_CHECK_MIN_INTERVAL_MS } from '@/config/pwa';
import { toast } from '@/molecules/Toaster/toast';
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate';

vi.mock('@/molecules/Toaster/toast');

type Listener = (event: Event) => void;

function createTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    }),
    emit(type: string) {
      act(() => {
        listeners.get(type)?.forEach((listener) => listener(new Event(type)));
      });
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function createWorker(state: ServiceWorkerState) {
  const target = createTarget();
  return Object.assign(target, { state, postMessage: vi.fn() });
}

type FakeWorker = ReturnType<typeof createWorker>;

function createRegistration() {
  const target = createTarget();
  return Object.assign(target, {
    waiting: null as FakeWorker | null,
    installing: null as FakeWorker | null,
    update: vi.fn().mockResolvedValue(undefined),
  });
}

type FakeRegistration = ReturnType<typeof createRegistration>;

function installServiceWorker(options: { controlled: boolean; registration: FakeRegistration }) {
  const container = Object.assign(createTarget(), {
    controller: options.controlled ? createWorker('activated') : null,
    ready: Promise.resolve(options.registration),
  });
  Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: container });
  Object.defineProperty(window, 'serwist', { configurable: true, writable: true, value: {} });
  return container;
}

async function flushReady() {
  await act(async () => {
    await Promise.resolve();
  });
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function lastToastOptions() {
  const calls = vi.mocked(toast).mock.calls;
  return calls[calls.length - 1][0];
}

function toastHandle(index: number) {
  return vi.mocked(toast).mock.results[index].value as { dismiss: ReturnType<typeof vi.fn> };
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
    Reflect.deleteProperty(window, 'serwist');
    Reflect.deleteProperty(window.navigator, 'serviceWorker');
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });

  it('is a no-op when window.serwist is undefined', async () => {
    const registration = createRegistration();
    registration.waiting = createWorker('installed');
    installServiceWorker({ controlled: true, registration });
    Reflect.deleteProperty(window, 'serwist');

    renderHook(() => useServiceWorkerUpdate());
    await flushReady();

    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('prompts once for a worker already waiting when the registration is ready', async () => {
    const registration = createRegistration();
    const waiting = createWorker('installed');
    registration.waiting = waiting;
    installServiceWorker({ controlled: true, registration });

    renderHook(() => useServiceWorkerUpdate());
    await flushReady();

    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
    expect(lastToastOptions()).toMatchObject({
      variant: 'info',
      title: 'Update available',
      persistent: true,
      dismissButton: true,
    });

    // A tab return re-checks the registration but does not nag about the same worker.
    setVisibility('visible');
    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
  });

  it('prompts when an update found later finishes installing', async () => {
    const registration = createRegistration();
    installServiceWorker({ controlled: true, registration });
    renderHook(() => useServiceWorkerUpdate());
    await flushReady();

    const installing = createWorker('installing');
    registration.installing = installing;
    registration.emit('updatefound');
    installing.state = 'installed';
    registration.waiting = installing;
    registration.installing = null;
    installing.emit('statechange');

    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
    expect(lastToastOptions().title).toBe('Update available');
  });

  it('replaces the prompt for a newer waiting worker found on a tab return', async () => {
    const registration = createRegistration();
    registration.waiting = createWorker('installed');
    installServiceWorker({ controlled: true, registration });
    renderHook(() => useServiceWorkerUpdate());
    await flushReady();
    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);

    registration.waiting = createWorker('installed');
    setVisibility('visible');

    expect(vi.mocked(toast)).toHaveBeenCalledTimes(2);
    expect(toastHandle(0).dismiss).toHaveBeenCalledTimes(1);
  });

  it('accepts whichever worker is waiting at click time, never a superseded one', async () => {
    const registration = createRegistration();
    const first = createWorker('installed');
    registration.waiting = first;
    const container = installServiceWorker({ controlled: true, registration });
    renderHook(() => useServiceWorkerUpdate());
    await flushReady();
    const staleAction = lastToastOptions().action;

    // A newer worker took the waiting slot; the first one is redundant and cannot be messaged.
    const newer = createWorker('installed');
    registration.waiting = newer;
    first.state = 'redundant';

    staleAction?.onClick();
    expect(first.postMessage).not.toHaveBeenCalled();
    expect(newer.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    // Nothing waiting any more: accepting is a no-op and must not arm a later forced reload.
    registration.waiting = null;
    staleAction?.onClick();
    container.emit('controllerchange');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads only the tab that accepted, even when it loaded without a controller', async () => {
    const registration = createRegistration();
    const waiting = createWorker('installed');
    registration.waiting = waiting;
    const container = installServiceWorker({ controlled: false, registration });
    renderHook(() => useServiceWorkerUpdate());
    await flushReady();

    lastToastOptions().action?.onClick();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    container.emit('controllerchange');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload or prompt when the first install claims an uncontrolled page', async () => {
    const registration = createRegistration();
    const container = installServiceWorker({ controlled: false, registration });
    renderHook(() => useServiceWorkerUpdate());
    await flushReady();

    container.emit('controllerchange');

    expect(reload).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('offers a reload instead of forcing one when another tab accepted the update', async () => {
    const registration = createRegistration();
    registration.waiting = createWorker('installed');
    const container = installServiceWorker({ controlled: true, registration });
    const dismiss = vi.fn();
    vi.mocked(toast).mockReturnValueOnce({ dismiss });
    renderHook(() => useServiceWorkerUpdate());
    await flushReady();
    expect(lastToastOptions().title).toBe('Update available');

    container.emit('controllerchange');

    expect(reload).not.toHaveBeenCalled();
    // The now-stale "Update available" prompt is withdrawn before the follow-up toast.
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(lastToastOptions()).toMatchObject({ title: 'Update installed', persistent: true, dismissButton: true });
    lastToastOptions().action?.onClick();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('treats a takeover after a first-install claim as an update', async () => {
    const registration = createRegistration();
    const container = installServiceWorker({ controlled: false, registration });
    renderHook(() => useServiceWorkerUpdate());
    await flushReady();

    container.emit('controllerchange');
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
    container.emit('controllerchange');
    expect(lastToastOptions().title).toBe('Update installed');

    // A further takeover replaces the previous notice instead of stacking another.
    container.emit('controllerchange');
    expect(vi.mocked(toast)).toHaveBeenCalledTimes(2);
    expect(toastHandle(0).dismiss).toHaveBeenCalledTimes(1);
  });

  it('notifies an uncontrolled tab that was prompted when the update is accepted elsewhere', async () => {
    const registration = createRegistration();
    registration.waiting = createWorker('installed');
    const container = installServiceWorker({ controlled: false, registration });
    renderHook(() => useServiceWorkerUpdate());
    await flushReady();
    expect(lastToastOptions().title).toBe('Update available');

    container.emit('controllerchange');

    expect(reload).not.toHaveBeenCalled();
    expect(toastHandle(0).dismiss).toHaveBeenCalledTimes(1);
    expect(lastToastOptions().title).toBe('Update installed');
  });

  it('throttles registration.update() checks to the configured interval', async () => {
    vi.useFakeTimers();
    const registration = createRegistration();
    installServiceWorker({ controlled: true, registration });
    renderHook(() => useServiceWorkerUpdate());
    await flushReady();

    setVisibility('visible');
    expect(registration.update).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SW_UPDATE_CHECK_MIN_INTERVAL_MS);
    setVisibility('visible');
    expect(registration.update).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('removes its listeners on unmount, including per-worker ones, and stops prompting', async () => {
    const registration = createRegistration();
    const container = installServiceWorker({ controlled: true, registration });
    const { unmount } = renderHook(() => useServiceWorkerUpdate());
    await flushReady();
    const installing = createWorker('installing');
    registration.installing = installing;
    registration.emit('updatefound');
    expect(installing.listenerCount('statechange')).toBe(1);

    unmount();

    expect(container.listenerCount('controllerchange')).toBe(0);
    expect(registration.listenerCount('updatefound')).toBe(0);
    expect(installing.listenerCount('statechange')).toBe(0);
    installing.state = 'installed';
    registration.waiting = installing;
    setVisibility('visible');
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('stops tracking a worker once it activates or becomes redundant', async () => {
    const registration = createRegistration();
    installServiceWorker({ controlled: true, registration });
    renderHook(() => useServiceWorkerUpdate());
    await flushReady();
    const installing = createWorker('installing');
    registration.installing = installing;
    registration.emit('updatefound');

    installing.state = 'redundant';
    installing.emit('statechange');

    expect(installing.listenerCount('statechange')).toBe(0);
  });
});
