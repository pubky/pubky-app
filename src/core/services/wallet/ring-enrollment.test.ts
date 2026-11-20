import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireRingDevice, ringEnrollment, RingEnrollmentError } from './ring-enrollment';

const auth = vi.hoisted(() => ({ getState: vi.fn(), subscribe: vi.fn() }));
vi.mock('@/stores/auth/auth.store', () => ({ useAuthStore: auth }));
vi.mock('@/libs/auth/capabilities', () => ({
  hasCapabilities: (granted: readonly string[]) => granted.includes('/priv/app.pubky/v1/:rw'),
}));

const account = 'y'.repeat(52);
const a = '921abca1-f50c-4865-ae31-cf2966b765ba';
const b = 'cf19d08f-707c-4ef6-ad89-47fb9c78059f';
const path = '/priv/app.pubky/v1/wallet/mainnet/device.json';
const missing = { name: 'RequestError', data: { reason: 'Http', statusCode: 404 } };
const record = (deviceId = a, mode = 'create') => ({ version: 1, deviceId, network: 'mainnet', mode });

function fixture() {
  let document: unknown = null;
  let locked = false;
  const lock = { timeoutSeconds: 9, free: vi.fn() };
  const storage = {
    lock: vi.fn(async () => {
      if (locked) throw { name: 'RequestError', data: { reason: 'Http', statusCode: 423 } };
      locked = true;
      return lock;
    }),
    unlock: vi.fn(async () => {
      locked = false;
    }),
    refreshLock: vi.fn(async () => {}),
    free: vi.fn(),
    getJson: vi.fn(async () => {
      if (document === null) throw missing;
      return document;
    }),
    putTextLocked: vi.fn(async (_handle, text: string) => {
      if (!locked) throw new Error('not locked');
      document = JSON.parse(text);
    }),
  };
  const key = { z32: vi.fn(() => account), free: vi.fn() };
  const info = { publicKey: key, capabilities: ['/priv/app.pubky/v1/:rw'], free: vi.fn() };
  const session = { storage, info };
  const state = { session, currentUserPubky: account, generation: 1, isLoggingOut: false, needsAccountSync: false };
  auth.getState.mockReturnValue(state);
  const subscribers = new Set<() => void>();
  auth.subscribe.mockImplementation((cb) => {
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  });
  return {
    state,
    storage,
    lock,
    key,
    info,
    set: (value: unknown) => {
      document = value;
    },
    get: () => document,
    signal: () => subscribers.forEach((cb) => cb()),
  };
}

describe('Ring private wallet device', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('distinguishes absent, owned, and foreign markers, rejecting malformed files and permission errors', async () => {
    const f = fixture();
    expect(await ringEnrollment(account, 'mainnet', a)).toBe('new');
    f.set(record());
    expect(await ringEnrollment(account, 'mainnet', a)).toBe('this-device');
    expect(await ringEnrollment(account, 'mainnet', b)).toBe('other-device');
    for (const value of [
      { ...record(), extra: 'unexpected' },
      { ...record(), network: 'testnet' },
      { deviceId: a },
      false,
    ]) {
      f.set(value);
      await expect(ringEnrollment(account, 'mainnet', a)).rejects.toThrow(/invalid/);
    }
    f.storage.getJson.mockRejectedValueOnce({
      name: 'CredentialRefreshError',
      data: { reason: 'Http', statusCode: 404 },
    });
    await expect(ringEnrollment(account, 'mainnet', a)).rejects.toThrow(/verify/);
    expect(f.storage.getJson).toHaveBeenCalledWith(path);
    expect(f.key.free).toHaveBeenCalledTimes(8);
    expect(f.info.free).toHaveBeenCalledTimes(8);
    expect(f.storage.free).toHaveBeenCalledTimes(8);
  });

  it('reserves an absent path before writing and prevents an overlapping device from entering', async () => {
    const f = fixture();
    const lease = await acquireRingDevice(account, 'mainnet', a, 'create', vi.fn());
    expect(f.storage.lock).toHaveBeenCalledWith(path, 90);
    expect(f.storage.lock.mock.invocationCallOrder[0]).toBeLessThan(f.storage.getJson.mock.invocationCallOrder[0]);
    expect(f.get()).toEqual(record());
    await expect(acquireRingDevice(account, 'mainnet', b, 'restore', vi.fn())).rejects.toThrow(/Another device/);
    await lease.release();
    await expect(acquireRingDevice(account, 'mainnet', b, 'create', vi.fn())).rejects.toThrow(/restored/);
    await expect(acquireRingDevice(account, 'mainnet', b, 'open', vi.fn())).rejects.toThrow(/restored/);
    const takeover = await acquireRingDevice(account, 'mainnet', b, 'restore', vi.fn());
    expect(takeover.mode).toBe('restore');
    expect(f.get()).toEqual(record(b, 'restore'));
    await Promise.all([takeover.release(), takeover.release()]);
    expect(f.storage.putTextLocked).toHaveBeenCalledTimes(2);
  });

  it('preserves a pre-registered mode and permits explicit recovery on an empty migrated homeserver', async () => {
    const f = fixture();
    await expect(acquireRingDevice(account, 'mainnet', a, 'open', vi.fn())).rejects.toThrow(/restored/);
    let lease = await acquireRingDevice(account, 'mainnet', a, 'restore', vi.fn());
    expect(lease.mode).toBe('restore');
    await lease.release();
    lease = await acquireRingDevice(account, 'mainnet', a, 'create', vi.fn());
    expect(lease.mode).toBe('restore');
    await lease.release();
    f.set(record(a, 'create'));
    lease = await acquireRingDevice(account, 'mainnet', a, 'restore', vi.fn());
    expect(lease.mode).toBe('create');
    await lease.release();
    expect(f.storage.putTextLocked).toHaveBeenCalledTimes(1);
  });

  it('stops on session replacement and refuses reads or writes through the wrong owner or grant', async () => {
    const f = fixture();
    f.key.z32.mockReturnValueOnce('other');
    await expect(acquireRingDevice(account, 'mainnet', a, 'create', vi.fn())).rejects.toThrow(/Authorize/);
    f.info.capabilities = [];
    await expect(ringEnrollment(account, 'mainnet', a)).rejects.toThrow(/Authorize/);
    f.info.capabilities = ['/priv/app.pubky/v1/:rw'];
    f.storage.getJson.mockImplementationOnce(async () => {
      f.state.generation++;
      throw missing;
    });
    const lost = vi.fn();
    await expect(acquireRingDevice(account, 'mainnet', a, 'create', lost)).rejects.toThrow(/lost/);
    expect(lost).toHaveBeenCalledOnce();
    expect(f.storage.putTextLocked).not.toHaveBeenCalled();
    const lease = await acquireRingDevice(account, 'mainnet', a, 'create', lost);
    f.state.currentUserPubky = '';
    f.signal();
    expect(() => lease.assertActive()).toThrow(/lost/);
    await lease.release();
    expect(lost).toHaveBeenCalledTimes(2);
  });

  it('renews the granted lifetime, fails closed on a stalled renewal and serializes unlock with it', async () => {
    const f = fixture();
    const lost = vi.fn();
    const lease = await acquireRingDevice(account, 'mainnet', a, 'create', lost);
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.storage.refreshLock).toHaveBeenCalledOnce();
    let resume!: () => void;
    f.storage.refreshLock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resume = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(lost).toHaveBeenCalledOnce();
    expect(() => lease.assertActive()).toThrow(/lost/);
    expect(f.storage.unlock).not.toHaveBeenCalled();
    const closing = lease.release();
    resume();
    await closing;
    expect(f.storage.unlock).toHaveBeenCalledOnce();
    expect(f.lock.free).toHaveBeenCalledOnce();
    expect(f.storage.free).toHaveBeenCalledOnce();
  });

  it('rejects a late initial lock response before reading or writing the marker', async () => {
    const f = fixture();
    let deliver!: (lock: typeof f.lock) => void;
    f.storage.lock.mockImplementationOnce(() => new Promise((resolve) => (deliver = resolve)));
    const acquiring = acquireRingDevice(account, 'mainnet', a, 'create', vi.fn());
    await vi.advanceTimersByTimeAsync(7000);
    deliver(f.lock);
    await expect(acquiring).rejects.toThrow(/expired/);
    expect(f.storage.getJson).not.toHaveBeenCalled();
    expect(f.storage.putTextLocked).not.toHaveBeenCalled();
    expect(f.storage.unlock).toHaveBeenCalledOnce();
  });

  it('charges the time in transit against the refreshed lease', async () => {
    const f = fixture();
    let deliver!: () => void;
    f.storage.refreshLock.mockImplementation(() => new Promise((resolve) => (deliver = resolve)));
    const lost = vi.fn();
    const lease = await acquireRingDevice(account, 'mainnet', a, 'create', lost);
    await vi.advanceTimersByTimeAsync(5500);
    expect(f.storage.refreshLock).toHaveBeenCalledOnce();
    deliver();
    await vi.advanceTimersByTimeAsync(500);
    // The first refresh started at 3000. Its response at 5500 does not reset the clock.
    expect(f.storage.refreshLock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3749);
    expect(() => lease.assertActive()).not.toThrow();
    await vi.advanceTimersByTimeAsync(1);
    expect(() => lease.assertActive()).toThrow(/lost/);
    expect(lost).toHaveBeenCalledOnce();
    deliver();
    await lease.release();
  });

  it('waits for the worker to shut down before releasing an early-lost lock', async () => {
    const f = fixture();
    let stopped!: () => void;
    const stop = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          stopped = resolve;
        }),
    );
    const lease = await acquireRingDevice(account, 'mainnet', a, 'create', stop);
    f.state.needsAccountSync = true;
    f.signal();
    expect(stop).toHaveBeenCalledOnce();
    await Promise.resolve();
    const releasing = lease.release();
    expect(f.storage.unlock).not.toHaveBeenCalled();
    expect(() => lease.assertActive()).toThrow(RingEnrollmentError);
    stopped();
    await releasing;
    expect(f.storage.unlock).toHaveBeenCalledOnce();
    await expect(ringEnrollment(account, 'mainnet', a)).rejects.toThrow(RingEnrollmentError);
    f.state.needsAccountSync = false;
    f.state.isLoggingOut = true;
    await expect(acquireRingDevice(account, 'mainnet', a, 'open', vi.fn())).rejects.toThrow(RingEnrollmentError);
  });

  it('lets the server lock expire if worker shutdown cannot be confirmed', async () => {
    const f = fixture();
    const lease = await acquireRingDevice(account, 'mainnet', a, 'create', async () => {
      throw new Error('shutdown interrupted');
    });
    f.state.isLoggingOut = true;
    f.signal();
    await lease.release();
    expect(f.storage.unlock).not.toHaveBeenCalled();
    expect(f.lock.free).toHaveBeenCalledOnce();
    expect(f.storage.free).toHaveBeenCalledOnce();
  });

  it('reports actionable lock errors without exposing server messages', async () => {
    const f = fixture();
    for (const [status, expected] of [
      [405, /version/],
      [423, /Another device/],
      [503, /Could not reach/],
    ] as const) {
      f.storage.lock.mockRejectedValueOnce({
        name: 'RequestError',
        message: 'untrusted message',
        data: { statusCode: status },
      });
      await expect(acquireRingDevice(account, 'mainnet', a, 'open', vi.fn())).rejects.toThrow(expected);
    }
    expect(f.storage.putTextLocked).not.toHaveBeenCalled();
  });

  it('releases after refused renewal or invalid server timeout', async () => {
    const f = fixture();
    const lost = vi.fn();
    const lease = await acquireRingDevice(account, 'mainnet', a, 'create', lost);
    f.storage.refreshLock.mockRejectedValueOnce(new Error('412'));
    await vi.advanceTimersByTimeAsync(3000);
    await lease.release();
    expect(lost).toHaveBeenCalledOnce();
    f.lock.timeoutSeconds = 0;
    await expect(acquireRingDevice(account, 'mainnet', a, 'open', vi.fn())).rejects.toThrow(/lifetime/);
    await Promise.resolve();
    expect(f.storage.unlock).toHaveBeenCalledTimes(2);
  });
});
