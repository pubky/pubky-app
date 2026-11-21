import type { Network } from '@beignet/wallet-core';
import type { Path, SessionStorage, StorageLock } from '@synonymdev/pubky';
import { z } from 'zod';
import { APP_PRIVATE_PATH } from '@/config/app-files';
import { hasCapabilities } from '@/libs/auth/capabilities';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  describeHandoff,
  downloadHandoff,
  handoffManifest,
  type HandoffProgress,
  readBoundedFile,
  retireHandoff,
  RingEnrollmentError,
  uploadHandoff,
} from './handoff-storage';

export { RingEnrollmentError };

type Mode = 'create' | 'restore';
type Intent = Mode | 'open';

const httpFailure = z.object({ name: z.literal('RequestError'), data: z.object({ statusCode: z.number() }) });

function safeError(error: unknown) {
  if (error instanceof RingEnrollmentError) return error;
  const failure = httpFailure.safeParse(error);
  const status = failure.success && failure.data.data.statusCode;
  if (status === 423)
    return new RingEnrollmentError('Another device is using this Ring wallet. Close it there and try again.');
  if (status === 507) return new RingEnrollmentError('Your homeserver needs more storage to save this wallet move.');
  if (status === 413)
    return new RingEnrollmentError('The homeserver could not accept a wallet transfer file of this size.');
  if (status === 405 || status === 501)
    return new RingEnrollmentError('This homeserver version does not support wallet device locks.');
  if (status === 401 || status === 403)
    return new RingEnrollmentError('Sign in again and authorize this wallet on your Pubky account.');
  return new RingEnrollmentError('Could not reach the homeserver or verify its wallet device record. Try again.');
}

const device = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const networks = z.enum(['mainnet', 'testnet', 'regtest']);
const mode = z.enum(['create', 'restore']);
const legacy = z.strictObject({ version: z.literal(1), network: networks, deviceId: device, mode });
const owned = z.strictObject({
  version: z.literal(2),
  state: z.literal('owned'),
  network: networks,
  deviceId: device,
  mode,
  transferId: device.nullable(),
  cleanup: z.strictObject({ transferId: device, manifest: handoffManifest }).optional(),
});
const ready = z.strictObject({
  version: z.literal(2),
  state: z.literal('ready'),
  network: networks,
  deviceId: device,
  mode,
  previousTransferId: device.nullable(),
  transferId: device,
  manifest: handoffManifest,
});
const marker = z.union([legacy, owned, ready]);
type Marker = z.infer<typeof marker>;
type Owner = z.infer<typeof legacy> | z.infer<typeof owned>;
type Ready = z.infer<typeof ready>;

export type RingDeviceStatus =
  | { state: 'new' }
  | { state: 'this-device' | 'other-device'; transferId: string | null }
  | { state: 'handoff-ready'; sourceDeviceId: string; transferId: string };

export type RingDeviceLease = {
  mode: Mode;
  release: () => Promise<void>;
  abandon: () => Promise<void>;
  assertActive: () => void;
  publishHandoff: (transferId: string, envelope: Uint8Array, onProgress?: HandoffProgress) => Promise<void>;
};
const movePending = () =>
  new RingEnrollmentError(
    'A wallet move is waiting. Complete it on the destination or cancel it on the original device.',
  );
const changed = () =>
  new RingEnrollmentError('The wallet device record changed. Reopen the wallet to check its owner.');

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
  return { session, storage: session.storage, network, path, current };
}

async function readMarker(storage: SessionStorage, path: Path, network: Network) {
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedFile(storage, path, 16 * 1024)),
    );
  } catch (error) {
    if (missingFile.safeParse(error).success) return null;
    if (error instanceof SyntaxError || error instanceof TypeError)
      throw new RingEnrollmentError('The private wallet device record is invalid.');
    throw safeError(error);
  }
  const result = marker.safeParse(value);
  if (!result.success || result.data.network !== network)
    throw new RingEnrollmentError('The private wallet device record is invalid.');
  return result.data;
}

export async function inspectRingDevice(
  account: string,
  network: Network,
  deviceId: string,
): Promise<RingDeviceStatus> {
  const { storage, path, current } = context(account, network, deviceId);
  try {
    const record = await readMarker(storage, path, network);
    if (!current()) throw new RingEnrollmentError('The signed-in Pubky account changed.');
    if (!record) return { state: 'new' };
    if (record.version === 2 && record.state === 'ready')
      return { state: 'handoff-ready', transferId: record.transferId, sourceDeviceId: record.deviceId };
    return { state: record.deviceId === deviceId ? 'this-device' : 'other-device', transferId: receipt(record) };
  } finally {
    storage.free();
  }
}

export async function ringEnrollment(account: string, network: Network, deviceId: string) {
  const { state } = await inspectRingDevice(account, network, deviceId);
  if (state === 'handoff-ready') throw movePending();
  return state;
}

function receipt(record: Owner) {
  return record.version === 1 ? null : record.transferId;
}

function requestTime() {
  return { wall: Date.now(), monotonic: performance.now() };
}

function elapsedSince(start: ReturnType<typeof requestTime>) {
  const wall = Date.now() - start.wall;
  return wall < 0 ? Infinity : Math.max(wall, performance.now() - start.monotonic);
}

function maintainLease(
  storage: SessionStorage,
  lock: StorageLock,
  requestedAt: ReturnType<typeof requestTime>,
  current: () => boolean,
  onLost: () => void | Promise<void>,
) {
  let active = true;
  let started = requestedAt;
  let usableLifetime = 0;
  let timer: ReturnType<typeof setTimeout>;
  let expiry: ReturnType<typeof setTimeout>;
  let queue: Promise<void> = Promise.resolve();
  const operations = new Set<Promise<unknown>>();
  let closing: Promise<void> | undefined;
  let abandoned = false;
  let stopped: ((success: boolean) => void) | undefined;
  const unsubscribe = useAuthStore.subscribe(() => {
    if (!current()) lose();
  });
  function finish(reason: 'release' | 'lost' | 'abandon') {
    if (reason === 'abandon') {
      abandoned = true;
      // May be called from the onLost shutdown path itself.
      stopped?.(false);
    }
    if (closing) return closing;
    active = false;
    unsubscribe();
    clearTimeout(timer);
    clearTimeout(expiry);
    window.removeEventListener('pageshow', resumed);
    document.removeEventListener('visibilitychange', resumed);
    const shutdown =
      reason === 'lost'
        ? new Promise<boolean>((resolve) => {
            stopped = resolve;
          })
        : Promise.resolve(true);
    closing = Promise.allSettled([queue, ...operations]).then(async () => {
      try {
        // An interrupted shutdown leaves the server lease to expire naturally.
        if ((await shutdown) && !abandoned) await storage.unlock(lock);
      } catch (error) {
        throw safeError(error);
      } finally {
        lock.free();
        storage.free();
      }
    });
    if (reason === 'lost') {
      try {
        void Promise.resolve(onLost()).then(
          () => stopped?.(true),
          () => stopped?.(false),
        );
      } catch {
        stopped?.(false);
      }
    }
    return closing;
  }
  function release() {
    return finish('release');
  }
  function abandon() {
    return finish('abandon');
  }
  function lose() {
    if (!active) return;
    void finish('lost').catch(() => {});
  }
  function expired() {
    return elapsedSince(started) >= usableLifetime;
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
  function schedule(requested: ReturnType<typeof requestTime>) {
    const seconds = lock.timeoutSeconds;
    if (!Number.isInteger(seconds) || seconds < 1)
      throw new RingEnrollmentError('The homeserver returned an invalid device lock lifetime.');
    const ttl = Math.min(seconds, leaseSeconds) * 1000;
    // The server starts the clock before its response reaches the browser.
    started = requested;
    usableLifetime = ttl - Math.min(5000, ttl / 4);
    const elapsed = elapsedSince(started);
    if (elapsed >= usableLifetime)
      throw new RingEnrollmentError('The Ring wallet device lock expired. Close this wallet and reopen it.');
    clearTimeout(timer);
    clearTimeout(expiry);
    expiry = setTimeout(lose, usableLifetime - elapsed);
    timer = setTimeout(
      () => {
        void run(async () => {
          const sent = requestTime();
          await storage.refreshLock(lock, leaseSeconds);
          assertActive();
          schedule(sent);
        }).catch(lose);
      },
      Math.max(0, Math.floor(ttl / 3) - elapsed),
    );
  }
  window.addEventListener('pageshow', resumed);
  document.addEventListener('visibilitychange', resumed);
  try {
    schedule(requestedAt);
  } catch (error) {
    void release().catch(() => {});
    throw safeError(error);
  }
  // Long uploads and worker installation can span many renewals. Keep their storage handles
  // alive until they settle without putting them ahead of a scheduled lock refresh.
  function track<T>(work: () => Promise<T>) {
    assertActive();
    const operation = Promise.resolve().then(() => {
      assertActive();
      return work();
    });
    operations.add(operation);
    void operation.then(
      () => operations.delete(operation),
      () => operations.delete(operation),
    );
    return operation;
  }
  return { release, abandon, run, assertActive, track };
}

async function lockedDevice(account: string, network: Network, id: string, onLost: () => void | Promise<void>) {
  const ctx = context(account, network, id);
  const requestedAt = requestTime();
  let lock: StorageLock;
  try {
    lock = await ctx.storage.lock(ctx.path, leaseSeconds);
  } catch (error) {
    ctx.storage.free();
    throw safeError(error);
  }
  const lease = maintainLease(ctx.storage, lock, requestedAt, ctx.current, onLost);
  const read = () => readMarker(ctx.storage, ctx.path, network);
  // All record transitions use the exclusive server token and do one write attempt.
  // Decode and compare the entire marker, including the immutable chunk manifest, under that token.
  async function replace(expected: Marker | null, next: Marker) {
    await lease.run(async () => {
      if (JSON.stringify(await read()) !== JSON.stringify(expected)) throw changed();
      const body = JSON.stringify(marker.parse(next));
      await HomeserverService.putTextLocked(ctx.session, ctx.storage, lock, body, lease.assertActive);
      if (JSON.stringify(await read()) !== body) throw changed();
    });
  }
  return { ...ctx, ...lease, read, replace };
}

type Held = Awaited<ReturnType<typeof lockedDevice>>;

// Call only with an owned marker just read or verified under this exclusive
// lease. A ready marker has no cleanup job. Keep the bounded job across failed
// deletes so storage limits cannot strand the next move or prevent local use.
async function cleanOwner(held: Held, owner: Owner): Promise<Owner> {
  if (owner.version !== 2 || !owner.cleanup) return owner;
  const { cleanup, ...clean } = owner;
  const complete = await held.track(() => retireHandoff({ ...held, transferId: cleanup.transferId }, cleanup.manifest));
  if (!complete) return owner;
  await held.replace(owner, clean);
  return clean;
}

function ownerLease(held: Held, owner: Owner): RingDeviceLease {
  let moving = false;
  function assertActive() {
    held.assertActive();
    if (moving) throw movePending();
  }
  async function publishHandoff(transferId: string, envelope: Uint8Array, onProgress?: HandoffProgress) {
    assertActive();
    if (!device.safeParse(transferId).success || transferId === owner.deviceId || transferId === receipt(owner))
      throw new RingEnrollmentError('Invalid wallet transfer identifier.');
    // The caller has already stopped and drained the engine. Never re-enable operations
    // in this session, including after an ambiguous publish response.
    moving = true;
    try {
      await held.track(async () => {
        const previous = await cleanOwner(held, owner);
        if (previous.version === 2 && previous.cleanup)
          throw new RingEnrollmentError(
            'Could not clear files from an earlier wallet move. Reopen the wallet to retry.',
          );
        const manifest = await describeHandoff(envelope, held.assertActive);
        const staging: Owner = {
          version: 2,
          state: 'owned',
          network: held.network,
          deviceId: owner.deviceId,
          mode: owner.mode,
          transferId: receipt(owner),
          cleanup: { transferId, manifest },
        };
        await held.replace(previous, staging);
        try {
          await uploadHandoff({ ...held, transferId }, envelope, manifest, onProgress);
        } catch (error) {
          // Publication has not been attempted, so this owner may safely retire
          // complete, partial, and missing chunks. Another lease can finish it.
          await cleanOwner(held, staging).catch(() => {});
          throw error;
        }
        const next: Ready = {
          version: 2,
          state: 'ready',
          network: held.network,
          deviceId: owner.deviceId,
          mode: owner.mode,
          previousTransferId: receipt(owner),
          transferId,
          manifest,
        };
        // An ambiguous response may mean the ready marker is already live.
        // Leave its files alone until a new lease observes ownership again.
        await held.replace(staging, next);
      });
    } catch (error) {
      throw safeError(error);
    }
  }
  return { mode: owner.mode, assertActive, release: held.release, abandon: held.abandon, publishHandoff };
}

export async function acquireRingDevice(
  account: string,
  network: Network,
  deviceId: string,
  intent: Intent,
  onLost: () => void | Promise<void>,
  installedTransferId: string | null = null,
): Promise<RingDeviceLease> {
  const held = await lockedDevice(account, network, deviceId, onLost);
  try {
    const record = await held.run(held.read);
    if (record?.version === 2 && record.state === 'ready') throw movePending();
    if (record?.deviceId === deviceId) {
      if (receipt(record) !== installedTransferId) throw changed();
      return ownerLease(held, await cleanOwner(held, record));
    }
    if (intent === 'open' || (record && intent !== 'restore'))
      throw new RingEnrollmentError('This wallet device must be explicitly restored before it can open.');
    if (intent !== 'create' && intent !== 'restore') throw new RingEnrollmentError('Invalid wallet device action.');
    // Only a fresh local provision can use cold recovery. Never promote a staged handoff using this path.
    if (installedTransferId !== null) throw changed();
    const next: Owner =
      record?.version === 2
        ? { ...record, deviceId, mode: intent, transferId: null }
        : { version: 1, network, deviceId, mode: intent };
    await held.replace(record, next);
    return ownerLease(held, await cleanOwner(held, next));
  } catch (error) {
    await held.release().catch(() => {});
    throw safeError(error);
  }
}

function requireTransfer(record: Marker | null, transferId: string): Ready {
  if (record?.version !== 2 || record.state !== 'ready' || record.transferId !== transferId) throw changed();
  return record;
}

export async function claimRingHandoff(
  account: string,
  network: Network,
  deviceId: string,
  transferId: string,
  onLost: () => void | Promise<void>,
  install: (envelope: Uint8Array, sourceDeviceId: string) => Promise<void>,
  onProgress?: HandoffProgress,
): Promise<RingDeviceLease> {
  const held = await lockedDevice(account, network, deviceId, onLost);
  try {
    const from = requireTransfer(await held.run(held.read), transferId);
    if (from.deviceId === deviceId) throw movePending();
    const ctx = { ...held, transferId };
    const envelope = await held.track(() => downloadHandoff(ctx, from.manifest, onProgress));
    held.assertActive();
    // The worker verifies the Ring-authenticated envelope and durably installs the local receipt.
    // Its promise must settle successfully before this browser can become the registered owner.
    await held.track(async () => {
      try {
        await install(envelope, from.deviceId);
      } catch (error) {
        if (error instanceof RingEnrollmentError) throw error;
        throw new RingEnrollmentError(
          'Could not verify and install this wallet move. Check your Ring identity and available device storage, then try again.',
        );
      }
    });
    const next: Owner = {
      version: 2,
      state: 'owned',
      network,
      deviceId,
      mode: from.mode,
      transferId,
      cleanup: { transferId, manifest: from.manifest },
    };
    await held.replace(from, next);
    return ownerLease(held, await cleanOwner(held, next));
  } catch (error) {
    await held.release().catch(() => {});
    throw safeError(error);
  }
}

export async function cancelRingHandoff(account: string, network: Network, deviceId: string, transferId: string) {
  const held = await lockedDevice(account, network, deviceId, () => {});
  try {
    const from = requireTransfer(await held.run(held.read), transferId);
    if (from.deviceId !== deviceId) throw changed();
    const next: Owner = {
      version: 2,
      state: 'owned',
      network,
      deviceId,
      mode: from.mode,
      transferId: from.previousTransferId,
      cleanup: { transferId, manifest: from.manifest },
    };
    await held.replace(from, next);
    await cleanOwner(held, next);
  } catch (error) {
    throw safeError(error);
  } finally {
    await held.release().catch(() => {});
  }
}
