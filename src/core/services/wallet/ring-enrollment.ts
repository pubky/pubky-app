import type { Network } from '@beignet/wallet-core';
import type { Path, SessionStorage, StorageLock } from '@synonymdev/pubky';
import { z } from 'zod';
import { APP_PRIVATE_PATH } from '@/config/app-files';
import { hasCapabilities } from '@/libs/auth/capabilities';
import { useAuthStore } from '@/stores/auth/auth.store';

type Mode = 'create' | 'restore';
type Intent = Mode | 'open';

export class RingEnrollmentError extends Error {}
const httpFailure = z.object({ name: z.literal('RequestError'), data: z.object({ statusCode: z.number() }) });

function safeError(error: unknown) {
  if (error instanceof RingEnrollmentError) return error;
  const failure = httpFailure.safeParse(error);
  const status = failure.success && failure.data.data.statusCode;
  if (status === 423)
    return new RingEnrollmentError('Another device is using this Ring wallet. Close it there and try again.');
  if (status === 405 || status === 501)
    return new RingEnrollmentError('This homeserver version does not support wallet device locks.');
  if (status === 401 || status === 403)
    return new RingEnrollmentError('Sign in again and authorize this wallet on your Pubky account.');
  return new RingEnrollmentError('Could not reach the homeserver or verify its wallet device record. Try again.');
}

const device = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const networks = z.enum(['mainnet', 'testnet', 'regtest']);
const marker = z.strictObject({
  version: z.literal(1),
  network: networks,
  deviceId: device,
  mode: z.enum(['create', 'restore']),
});
const missingFile = z.object({
  name: z.literal('RequestError'),
  data: z.object({ reason: z.literal('Http'), statusCode: z.literal(404) }),
});
const leaseSeconds = 90;

function context(account: string, network: Network, deviceId: string) {
  const { session, currentUserPubky, generation, isLoggingOut, needsAccountSync } = useAuthStore.getState();
  if (
    !session ||
    isLoggingOut ||
    needsAccountSync ||
    account !== currentUserPubky ||
    !/^[ybndrfg8ejkmcpqxot1uwisza345h769]{51}[yo]$/.test(account)
  ) {
    throw new RingEnrollmentError('Sign in again with the Pubky account that owns this wallet.');
  }
  if (!networks.safeParse(network).success || !device.safeParse(deviceId).success) {
    throw new RingEnrollmentError('Invalid Bitcoin network or wallet device.');
  }
  const path = `${APP_PRIVATE_PATH}wallet/${network}/device.json` as const;
  const info = session.info;
  try {
    const key = info.publicKey;
    try {
      if (key.z32() !== account || !hasCapabilities(info.capabilities, [path + ':rw'])) {
        throw new RingEnrollmentError('Authorize this Pubky account to manage its private wallet device.');
      }
    } finally {
      key.free();
    }
  } finally {
    info.free();
  }
  const current = () => {
    const state = useAuthStore.getState();
    return (
      !state.isLoggingOut &&
      !state.needsAccountSync &&
      state.currentUserPubky === account &&
      state.session === session &&
      state.generation === generation
    );
  };
  return { storage: session.storage, path, current };
}

async function readMarker(storage: SessionStorage, path: Path, network: Network) {
  let value: unknown;
  try {
    value = await storage.getJson(path);
  } catch (error) {
    if (missingFile.safeParse(error).success) return null;
    throw safeError(error);
  }
  const result = marker.safeParse(value);
  if (!result.success || result.data.network !== network)
    throw new RingEnrollmentError('The private wallet device record is invalid.');
  return result.data;
}

export async function ringEnrollment(
  account: string,
  network: Network,
  deviceId: string,
): Promise<'new' | 'this-device' | 'other-device'> {
  const { storage, path, current } = context(account, network, deviceId);
  try {
    const record = await readMarker(storage, path, network);
    if (!current()) throw new RingEnrollmentError('The signed-in Pubky account changed.');
    return record === null ? 'new' : record.deviceId === deviceId ? 'this-device' : 'other-device';
  } finally {
    storage.free();
  }
}

function maintainLease(
  storage: SessionStorage,
  lock: StorageLock,
  current: () => boolean,
  onLost: () => void | Promise<void>,
) {
  let active = true;
  let grantedAt = 0;
  let deadline = 0;
  let monotonicDeadline = 0;
  let timer: ReturnType<typeof setTimeout>;
  let expiry: ReturnType<typeof setTimeout>;
  let queue: Promise<void> = Promise.resolve();
  let closing: Promise<void> | undefined;
  const unsubscribe = useAuthStore.subscribe(() => {
    if (!current()) lose();
  });
  function finish(lost: boolean) {
    if (closing) return closing;
    active = false;
    unsubscribe();
    clearTimeout(timer);
    clearTimeout(expiry);
    window.removeEventListener('pageshow', resumed);
    document.removeEventListener('visibilitychange', resumed);
    let stopped!: (success: boolean) => void;
    const shutdown = lost
      ? new Promise<boolean>((resolve) => {
          stopped = resolve;
        })
      : Promise.resolve(true);
    closing = queue.then(async () => {
      try {
        // An interrupted shutdown leaves the server lease to expire naturally.
        if (await shutdown) await storage.unlock(lock);
      } catch (error) {
        throw safeError(error);
      } finally {
        lock.free();
        storage.free();
      }
    });
    if (lost) {
      try {
        void Promise.resolve(onLost()).then(
          () => stopped(true),
          () => stopped(false),
        );
      } catch {
        stopped(false);
      }
    }
    return closing;
  }
  function release() {
    return finish(false);
  }
  function lose() {
    if (!active) return;
    void finish(true).catch(() => {});
  }
  function expired() {
    const now = Date.now();
    return now < grantedAt || now >= deadline || performance.now() >= monotonicDeadline;
  }
  function assertActive() {
    if (!active || !current() || expired()) {
      lose();
      throw new RingEnrollmentError('The Ring wallet device lock was lost. Close this wallet and reopen it.');
    }
  }
  function resumed() {
    if (!current() || expired()) lose();
  }
  function run<T>(work: () => Promise<T>) {
    const result = queue.then(async () => {
      assertActive();
      const value = await work();
      assertActive();
      return value;
    });
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  function schedule() {
    const seconds = lock.timeoutSeconds;
    if (!Number.isInteger(seconds) || seconds < 1)
      throw new RingEnrollmentError('The homeserver returned an invalid device lock lifetime.');
    const ttl = Math.min(seconds, leaseSeconds) * 1000;
    // Stop authorizing work before the homeserver could issue the next device a lock.
    const usable = ttl - Math.min(5000, ttl / 4);
    grantedAt = Date.now();
    deadline = grantedAt + usable;
    monotonicDeadline = performance.now() + usable;
    clearTimeout(timer);
    clearTimeout(expiry);
    expiry = setTimeout(lose, deadline - Date.now());
    timer = setTimeout(
      () => {
        void run(async () => {
          await storage.refreshLock(lock, leaseSeconds);
          assertActive();
          schedule();
        }).catch(lose);
      },
      Math.floor(ttl / 3),
    );
  }
  window.addEventListener('pageshow', resumed);
  document.addEventListener('visibilitychange', resumed);
  try {
    schedule();
  } catch (error) {
    void release().catch(() => {});
    throw safeError(error);
  }
  return { release, run, assertActive };
}

export async function acquireRingDevice(
  account: string,
  network: Network,
  deviceId: string,
  intent: Intent,
  onLost: () => void | Promise<void>,
) {
  const { storage, path, current } = context(account, network, deviceId);
  let lock: StorageLock;
  try {
    lock = await storage.lock(path, leaseSeconds);
  } catch (error) {
    storage.free();
    throw safeError(error);
  }
  const lease = maintainLease(storage, lock, current, onLost);
  try {
    const mode = await lease.run(async () => {
      const record = await readMarker(storage, path, network);
      lease.assertActive();
      if (record?.deviceId === deviceId) return record.mode;
      if (intent === 'open' || (record && intent !== 'restore')) {
        throw new RingEnrollmentError('This wallet device must be explicitly restored before it can open.');
      }
      if (intent !== 'create' && intent !== 'restore') throw new RingEnrollmentError('Invalid wallet device action.');
      await storage.putTextLocked(lock, JSON.stringify({ version: 1, network, deviceId, mode: intent }));
      return intent;
    });
    return { mode, release: lease.release, assertActive: lease.assertActive };
  } catch (error) {
    await lease.release().catch(() => {});
    throw safeError(error);
  }
}
