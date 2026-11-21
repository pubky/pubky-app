import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireRingDevice,
  cancelRingHandoff,
  claimRingHandoff,
  inspectRingDevice,
  ringEnrollment,
  RingEnrollmentError,
} from './ring-enrollment';

const auth = vi.hoisted(() => ({ getState: vi.fn(), subscribe: vi.fn() }));
vi.mock('@/stores/auth/auth.store', () => ({ useAuthStore: auth }));
vi.mock('@/libs/auth/capabilities', () => ({
  hasCapabilities: (granted: readonly string[]) => granted.includes('/priv/app.pubky/v1/:rw'),
}));

const account = 'y'.repeat(52);
const a = '921abca1-f50c-4865-ae31-cf2966b765ba';
const b = 'cf19d08f-707c-4ef6-ad89-47fb9c78059f';
const transfer = '1a1ecc6e-e03c-4957-a438-2893d15ddb88';
const secondTransfer = 'e11d1252-ac2a-4291-8aef-94dfdfaf80d1';
const body = Uint8Array.of(50, 27, 19);
const path = '/priv/app.pubky/v1/wallet/mainnet/device.json';
const missing = { name: 'RequestError', data: { reason: 'Http', statusCode: 404 } };
const record = (deviceId = a, mode = 'create') => ({ version: 1, deviceId, network: 'mainnet', mode });

function fixture() {
  let document: unknown = null;
  let locked = false;
  const files = new Map<string, Uint8Array>();
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
    get: vi.fn(async (key: string) => {
      if (key !== path) {
        const body = files.get(key);
        if (!body) throw missing;
        return new Response(body.slice());
      }
      if (document === null) throw missing;
      return new Response(JSON.stringify(document));
    }),
    putBytes: vi.fn(async (key: string, bytes: Uint8Array) => {
      files.set(key, bytes.slice());
    }),
    delete: vi.fn(async (key: string) => {
      if (!files.delete(key)) throw missing;
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
    files,
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
    f.storage.get.mockRejectedValueOnce({
      name: 'CredentialRefreshError',
      data: { reason: 'Http', statusCode: 404 },
    });
    await expect(ringEnrollment(account, 'mainnet', a)).rejects.toThrow(/verify/);
    expect(f.storage.get).toHaveBeenCalledWith(path);
    expect(f.key.free).toHaveBeenCalledTimes(8);
    expect(f.info.free).toHaveBeenCalledTimes(8);
    expect(f.storage.free).toHaveBeenCalledTimes(8);
  });

  it('reserves an absent path before writing and prevents an overlapping device from entering', async () => {
    const f = fixture();
    const lease = await acquireRingDevice(account, 'mainnet', a, 'create', vi.fn());
    expect(f.storage.lock).toHaveBeenCalledWith(path, 90);
    expect(f.storage.lock.mock.invocationCallOrder[0]).toBeLessThan(f.storage.get.mock.invocationCallOrder[0]);
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

  async function ready() {
    const f = fixture();
    const held = await acquireRingDevice(account, 'mainnet', a, 'create', vi.fn());
    await held.publishHandoff(transfer, body);
    await held.release();
    return f;
  }

  it('publishes only verified immutable chunks and fences the source until explicit cancellation', async () => {
    const f = fixture();
    const held = await acquireRingDevice(account, 'mainnet', a, 'create', vi.fn());
    const envelope = new Uint8Array(2 * 1024 * 1024 + 5).fill(61);
    const progress = vi.fn();
    const publish = held.publishHandoff(transfer, envelope, progress);
    expect(() => held.assertActive()).toThrow(/move/);
    await publish;
    expect(progress.mock.calls).toEqual([
      [envelope.length - 5, envelope.length],
      [envelope.length, envelope.length],
    ]);
    expect(f.files.size).toBe(2);
    expect(f.get()).toMatchObject({
      version: 2,
      state: 'ready',
      deviceId: a,
      transferId: transfer,
      manifest: { bytes: envelope.length },
    });
    expect(await inspectRingDevice(account, 'mainnet', b)).toEqual({
      state: 'handoff-ready',
      sourceDeviceId: a,
      transferId: transfer,
    });
    await expect(ringEnrollment(account, 'mainnet', b)).rejects.toThrow(/move/);
    await held.release();
    for (const id of [a, b]) {
      for (const intent of ['open', 'restore', 'create'] as const)
        await expect(acquireRingDevice(account, 'mainnet', id, intent, vi.fn())).rejects.toThrow(/move/);
    }
    await expect(cancelRingHandoff(account, 'mainnet', a, secondTransfer)).rejects.toThrow(/changed/);
    await expect(cancelRingHandoff(account, 'mainnet', b, transfer)).rejects.toThrow(/changed/);
    await cancelRingHandoff(account, 'mainnet', a, transfer);
    expect(f.files.size).toBe(0);
    expect(f.get()).toMatchObject({ version: 2, state: 'owned', deviceId: a, transferId: null });
    await expect(claimRingHandoff(account, 'mainnet', b, transfer, vi.fn(), vi.fn())).rejects.toThrow(/changed/);
    const restored = await acquireRingDevice(account, 'mainnet', a, 'open', vi.fn());
    await restored.release();
  });

  it('holds the lease across a long durable install, rejects competing claims, and opens only the installed receipt', async () => {
    const f = await ready();
    let installed!: () => void;
    let installing!: () => void;
    const began = new Promise<void>((resolve) => (installing = resolve));
    const progress = vi.fn();
    const claim = claimRingHandoff(
      account,
      'mainnet',
      b,
      transfer,
      vi.fn(),
      async (envelope, source) => {
        expect(envelope).toEqual(body);
        expect(source).toBe(a);
        installing();
        await new Promise<void>((resolve) => (installed = resolve));
      },
      progress,
    );
    await began;
    expect(progress.mock.calls).toEqual([[body.length, body.length]]);
    expect(f.get()).toMatchObject({ state: 'ready' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(f.storage.refreshLock).toHaveBeenCalledTimes(5);
    await expect(cancelRingHandoff(account, 'mainnet', a, transfer)).rejects.toThrow(/Another device/);
    await expect(claimRingHandoff(account, 'mainnet', secondTransfer, transfer, vi.fn(), vi.fn())).rejects.toThrow(
      /Another device/,
    );
    installed();
    const claimed = await claim;
    expect(f.files.size).toBe(0);
    expect(() => claimed.assertActive()).not.toThrow();
    expect(f.get()).toMatchObject({ version: 2, state: 'owned', deviceId: b, transferId: transfer });
    await claimed.release();
    await expect(cancelRingHandoff(account, 'mainnet', a, transfer)).rejects.toThrow(/changed/);
    await expect(acquireRingDevice(account, 'mainnet', a, 'open', vi.fn())).rejects.toThrow(/restored/);
    for (const stale of [null, secondTransfer])
      await expect(acquireRingDevice(account, 'mainnet', b, 'open', vi.fn(), stale)).rejects.toThrow(/changed/);
    const owner = await acquireRingDevice(account, 'mainnet', b, 'open', vi.fn(), transfer);
    await owner.publishHandoff(secondTransfer, body);
    await owner.release();
    await cancelRingHandoff(account, 'mainnet', b, secondTransfer);
    expect(f.get()).toMatchObject({ version: 2, state: 'owned', deviceId: b, transferId: transfer });
  });

  it('renews independently of chunk uploads and leaves corrupted uploads unpublished', async () => {
    const f = fixture();
    const held = await acquireRingDevice(account, 'mainnet', a, 'create', vi.fn());
    let resume!: () => void;
    let uploading!: () => void;
    const began = new Promise<void>((resolve) => (uploading = resolve));
    f.storage.putBytes.mockImplementationOnce(async (key) => {
      uploading();
      await new Promise<void>((resolve) => (resume = resolve));
      f.files.set(key, Uint8Array.of(0, 0, 0));
    });
    const publishing = held.publishHandoff(transfer, body);
    await began;
    await vi.advanceTimersByTimeAsync(12_000);
    expect(f.storage.refreshLock).toHaveBeenCalledTimes(4);
    resume();
    await expect(publishing).rejects.toThrow(/invalid/);
    expect(f.get()).toEqual({
      version: 2,
      state: 'owned',
      network: 'mainnet',
      deviceId: a,
      mode: 'create',
      transferId: null,
    });
    expect(f.files.size).toBe(0);
    expect(() => held.assertActive()).toThrow(/move/);
    await held.release();
    const owner = await acquireRingDevice(account, 'mainnet', a, 'open', vi.fn());
    await owner.release();
  });

  it('reclaims partial uploads after a quota or cleanup failure without touching other private files', async () => {
    const f = fixture();
    const unrelated = path.replace('device.json', 'handoffs/' + secondTransfer + '/keep.bin');
    f.files.set(unrelated, body);
    const held = await acquireRingDevice(account, 'mainnet', a, 'create', vi.fn());
    const full = { name: 'RequestError', data: { reason: 'Http', statusCode: 507 } };
    f.storage.putBytes
      .mockImplementationOnce(async (key, bytes) => {
        expect(f.get()).toMatchObject({
          state: 'owned',
          cleanup: { transferId: transfer, manifest: { chunks: expect.any(Array) } },
        });
        f.files.set(key, bytes.slice());
      })
      .mockRejectedValueOnce(full);
    f.storage.delete.mockRejectedValueOnce(new Error('cleanup unavailable'));
    await expect(held.publishHandoff(transfer, new Uint8Array(2 * 1024 * 1024 + 1))).rejects.toThrow(/storage/);
    await held.release();
    expect(f.get()).toMatchObject({ state: 'owned', cleanup: { transferId: transfer } });
    expect(f.files.size).toBe(2);
    const owner = await acquireRingDevice(account, 'mainnet', a, 'open', vi.fn());
    expect(f.files).toEqual(new Map([[unrelated, body]]));
    expect(f.get()).not.toHaveProperty('cleanup');
    await owner.publishHandoff(secondTransfer, body);
    await owner.release();
    expect(f.get()).toMatchObject({ state: 'ready', transferId: secondTransfer });
  });

  it('recovers a crash after journaling but before the first PUT, including authoritatively missing chunks', async () => {
    const f = fixture();
    const held = await acquireRingDevice(account, 'mainnet', a, 'create', vi.fn());
    f.storage.putTextLocked.mockImplementationOnce(async (_handle, text) => {
      f.set(JSON.parse(text));
      throw new Error('lost the journaling acknowledgement');
    });
    await expect(held.publishHandoff(transfer, body)).rejects.toThrow();
    await held.release();
    expect(f.storage.putBytes).not.toHaveBeenCalled();
    expect(f.get()).toMatchObject({ state: 'owned', cleanup: { transferId: transfer } });
    const owner = await acquireRingDevice(account, 'mainnet', a, 'open', vi.fn());
    expect(f.storage.delete).toHaveBeenCalledOnce();
    expect(f.get()).not.toHaveProperty('cleanup');
    await owner.release();
  });

  it('rejects truncated, oversized, substituted or unavailable chunks before invoking the installer', async () => {
    const f = await ready();
    const [chunk] = f.files.keys();
    const install = vi.fn();
    for (const wrong of [body.slice(1), Uint8Array.of(...body, 0), Uint8Array.of(4, 5, 6)]) {
      f.files.set(chunk, wrong);
      await expect(claimRingHandoff(account, 'mainnet', b, transfer, vi.fn(), install)).rejects.toThrow(/invalid/);
    }
    f.files.delete(chunk);
    await expect(claimRingHandoff(account, 'mainnet', b, transfer, vi.fn(), install)).rejects.toThrow();
    expect(install).not.toHaveBeenCalled();
    expect(f.get()).toMatchObject({ state: 'ready' });
    f.set({ data: 'x'.repeat(20_000) });
    await expect(inspectRingDevice(account, 'mainnet', a)).rejects.toThrow(/invalid/);
  });

  it('requires the same ready marker after installation and refuses a failed local install', async () => {
    const f = await ready();
    await expect(
      claimRingHandoff(account, 'mainnet', b, transfer, vi.fn(), async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow();
    expect(f.get()).toMatchObject({ state: 'ready' });
    // A mismatching transfer, even on the same source device, is not this claim.
    await expect(
      claimRingHandoff(account, 'mainnet', b, transfer, vi.fn(), async () => {
        f.set({ ...Object(f.get()), transferId: secondTransfer });
      }),
    ).rejects.toThrow(/changed/);
    expect(f.get()).toMatchObject({ state: 'ready', transferId: secondTransfer });
  });

  it('recovers an ambiguous publication or claim by inspecting the durable owner and exact receipt', async () => {
    const f = fixture();
    const held = await acquireRingDevice(account, 'mainnet', a, 'create', vi.fn());
    const ambiguous = async (_handle: unknown, written: string) => {
      f.set(JSON.parse(written));
      throw new Error('response interrupted after commit');
    };
    // Staging succeeds; the ready write commits but never returns.
    f.storage.putTextLocked
      .mockImplementationOnce(async (_handle, text) => f.set(JSON.parse(text)))
      .mockImplementationOnce(ambiguous);
    await expect(held.publishHandoff(transfer, body)).rejects.toThrow();
    await held.release();
    await expect(acquireRingDevice(account, 'mainnet', a, 'open', vi.fn())).rejects.toThrow(/move/);
    expect(f.files.size).toBe(1);
    f.storage.putTextLocked.mockImplementationOnce(ambiguous);
    const installed = vi.fn();
    await expect(claimRingHandoff(account, 'mainnet', b, transfer, vi.fn(), installed)).rejects.toThrow();
    expect(installed).toHaveBeenCalledOnce();
    expect(await inspectRingDevice(account, 'mainnet', b)).toEqual({ state: 'this-device', transferId: transfer });
    await expect(acquireRingDevice(account, 'mainnet', b, 'open', vi.fn())).rejects.toThrow(/changed/);
    const owner = await acquireRingDevice(account, 'mainnet', b, 'open', vi.fn(), transfer);
    expect(f.files.size).toBe(0);
    expect(f.get()).not.toHaveProperty('cleanup');
    await owner.release();
  });

  it('stops on session replacement and refuses reads or writes through the wrong owner or grant', async () => {
    const f = fixture();
    f.key.z32.mockReturnValueOnce('other');
    await expect(acquireRingDevice(account, 'mainnet', a, 'create', vi.fn())).rejects.toThrow(/Authorize/);
    f.info.capabilities = [];
    await expect(ringEnrollment(account, 'mainnet', a)).rejects.toThrow(/Authorize/);
    f.info.capabilities = ['/priv/app.pubky/v1/:rw'];
    f.storage.get.mockImplementationOnce(async () => {
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
    expect(f.storage.get).not.toHaveBeenCalled();
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

  it('abandons an uncertain shutdown without renewing or unlocking, and drains an in-flight refresh', async () => {
    const f = fixture();
    const lost = vi.fn();
    const lease = await acquireRingDevice(account, 'mainnet', a, 'create', lost);
    let refreshed!: () => void;
    f.storage.refreshLock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          refreshed = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(3000);
    const closing = lease.abandon();
    expect(() => lease.assertActive()).toThrow(/lost/);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.storage.refreshLock).toHaveBeenCalledOnce();
    expect(f.lock.free).not.toHaveBeenCalled();
    expect(lost).not.toHaveBeenCalled();
    refreshed();
    await Promise.all([closing, lease.release(), lease.abandon()]);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(f.storage.refreshLock).toHaveBeenCalledOnce();
    expect(f.storage.unlock).not.toHaveBeenCalled();
    expect(f.lock.free).toHaveBeenCalledOnce();
    expect(f.storage.free).toHaveBeenCalledOnce();
  });

  it('can abandon from the loss callback itself without a second shutdown or a circular wait', async () => {
    const f = fixture();
    let lease: Awaited<ReturnType<typeof acquireRingDevice>>;
    const lost = vi.fn(() => lease.abandon());
    lease = await acquireRingDevice(account, 'mainnet', a, 'create', lost);
    f.state.isLoggingOut = true;
    f.signal();
    await lease.release();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(lost).toHaveBeenCalledOnce();
    expect(f.storage.refreshLock).not.toHaveBeenCalled();
    expect(f.storage.unlock).not.toHaveBeenCalled();
    expect(f.lock.free).toHaveBeenCalledOnce();
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
      [507, /storage/],
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
