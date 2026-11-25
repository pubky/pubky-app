import { Keypair } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPubchiOwnerData,
  deletePubchiDatabase,
  getPubchiDatabase,
  resetPubchiDatabaseForTests,
} from '@/database/pubchi/pubchi';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import {
  DEVICE_DELEGATION_MAX_SECONDS,
  DEVICE_DELEGATION_REFRESH_SECONDS,
  getCurrentDeviceKey,
  loadOrGenerateDeviceKey,
  signWithDeviceKey,
  wipeDeviceKeysNotOwnedBy,
} from './device-key';
import { readPendingDelegationDeletes } from './pending-delegation-deletes';

const OWNER = Keypair.random().publicKey.z32();

describe('Pubchi device signer persistence', () => {
  beforeEach(() => localStorage.clear());

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    resetRuntimeConfigForTests();
    await deletePubchiDatabase();
    resetPubchiDatabaseForTests();
  });

  it('reloads the stored CryptoKey and signs after a fresh module load', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const created = await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);
    resetPubchiDatabaseForTests();
    const restored = await getCurrentDeviceKey(OWNER, 1_800_000_001);
    expect(restored?.signer).toBe(created.signer);
    await expect(signWithDeviceKey(restored!.key, new TextEncoder().encode('reload-proof'))).resolves.toMatch(
      /^[0-9a-f]{128}$/,
    );
  });

  it('creates a non-extractable private key that Web Crypto refuses to export', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const created = await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);
    expect(created.key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('pkcs8', created.key)).rejects.toThrow();
  });

  it('does not resurrect a device key when generation finishes after owner cleanup', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
    let finishGeneration: (pair: CryptoKeyPair) => void = () => undefined;
    const generated = new Promise<CryptoKeyPair>((resolve) => {
      finishGeneration = resolve;
    });
    const generate = vi.spyOn(crypto.subtle, 'generateKey').mockReturnValueOnce(generated);
    let current = true;
    const assertCurrent = () => {
      if (!current) throw new Error('Session changed');
    };
    const mint = loadOrGenerateDeviceKey(OWNER, 1_800_000_000, assertCurrent);
    const rejection = expect(mint).rejects.toThrow('Session changed');
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());

    current = false;
    await clearPubchiOwnerData(OWNER);
    finishGeneration(pair);

    await rejection;
    expect(await getPubchiDatabase().deviceKeys.where('owner').equals(OWNER).toArray()).toEqual([]);
    expect(localStorage.getItem(`pubchi.deviceSigner:${OWNER}`)).toBeNull();
  });

  it('rolls back the device row when the session changes during its write', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const table = getPubchiDatabase().deviceKeys;
    const put = table.put.bind(table);
    let current = true;
    vi.spyOn(table, 'put').mockImplementationOnce((record) =>
      put(record).then((key) => {
        current = false;
        return key;
      }),
    );

    await expect(
      loadOrGenerateDeviceKey(OWNER, 1_800_000_000, () => {
        if (!current) throw new Error('Session changed');
      }),
    ).rejects.toThrow('Session changed');

    expect(await table.where('owner').equals(OWNER).toArray()).toEqual([]);
    expect(localStorage.getItem(`pubchi.deviceSigner:${OWNER}`)).toBeNull();
  });

  it('creates delegations with the seven-day lifetime and refreshes within two days', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const created = await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);

    expect(created.expires_at - created.created_at).toBe(DEVICE_DELEGATION_MAX_SECONDS);
    expect(DEVICE_DELEGATION_MAX_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(DEVICE_DELEGATION_REFRESH_SECONDS).toBe(2 * 24 * 60 * 60);
    await getPubchiDatabase().deviceKeys.update(created.id, {
      expires_at: 1_800_000_000 + DEVICE_DELEGATION_REFRESH_SECONDS + 1,
    });
    await expect(loadOrGenerateDeviceKey(OWNER, 1_800_000_000)).resolves.toMatchObject({ signer: created.signer });
    await getPubchiDatabase().deviceKeys.update(created.id, {
      expires_at: 1_800_000_000 + DEVICE_DELEGATION_REFRESH_SECONDS,
    });
    await expect(loadOrGenerateDeviceKey(OWNER, 1_800_000_000)).resolves.not.toMatchObject({ signer: created.signer });
    localStorage.removeItem('pubchi.pendingDelegationDeletes');
  });

  it('fails closed when no device key is available', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    expect(await getCurrentDeviceKey(OWNER, 1_800_000_000)).toBeUndefined();
  });

  it('queues an expiring key before deleting its Dexie row', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const created = await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);
    await getPubchiDatabase().deviceKeys.update(created.id, {
      expires_at: 1_800_000_100,
    });

    await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);

    expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer: created.signer }]);
    expect(await getPubchiDatabase().deviceKeys.get(created.id)).toBeUndefined();
  });

  it('keeps an expiring key when its pending-delete record cannot be persisted', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const created = await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);
    await getPubchiDatabase().deviceKeys.update(created.id, {
      expires_at: 1_800_000_100,
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    try {
      await expect(loadOrGenerateDeviceKey(OWNER, 1_800_000_000)).rejects.toThrow(
        'Could not persist expiring Pubchi device deletion',
      );
      expect(await getPubchiDatabase().deviceKeys.get(created.id)).toBeDefined();
    } finally {
      setItem.mockRestore();
    }
  });

  it('keeps signer pointers distinct per owner and migrates the legacy pointer once', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const otherOwner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
    const first = await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);
    const second = await loadOrGenerateDeviceKey(otherOwner, 1_800_000_000);

    expect(localStorage.getItem(`pubchi.deviceSigner:${OWNER}`)).toBe(first.signer);
    expect(localStorage.getItem(`pubchi.deviceSigner:${otherOwner}`)).toBe(second.signer);
    expect(first.signer).not.toBe(second.signer);

    localStorage.removeItem(`pubchi.deviceSigner:${OWNER}`);
    localStorage.setItem('pubchi.deviceSigner', first.signer);
    expect(await getCurrentDeviceKey(OWNER, 1_800_000_001)).toMatchObject({ signer: first.signer });
    expect(localStorage.getItem(`pubchi.deviceSigner:${OWNER}`)).toBe(first.signer);
    expect(localStorage.getItem('pubchi.deviceSigner')).toBeNull();
    expect(await getCurrentDeviceKey(otherOwner, 1_800_000_001)).toMatchObject({ signer: second.signer });
  });

  it('does not migrate a legacy pointer belonging to another owner', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const otherOwner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
    const first = await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);
    const second = await loadOrGenerateDeviceKey(otherOwner, 1_800_000_000);

    localStorage.removeItem(`pubchi.deviceSigner:${OWNER}`);
    localStorage.setItem('pubchi.deviceSigner', second.signer);

    await expect(getCurrentDeviceKey(OWNER, 1_800_000_001)).resolves.toBeUndefined();
    expect(localStorage.getItem(`pubchi.deviceSigner:${OWNER}`)).toBeNull();
    expect(localStorage.getItem('pubchi.deviceSigner')).toBe(second.signer);
    expect(first.signer).not.toBe(second.signer);
  });

  it('continues using the legacy pointer when migration storage fails', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const created = await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);
    localStorage.removeItem(`pubchi.deviceSigner:${OWNER}`);
    localStorage.setItem('pubchi.deviceSigner', created.signer);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const unhandledRejection = vi.fn();
    process.on('unhandledRejection', unhandledRejection);

    try {
      await expect(getCurrentDeviceKey(OWNER, 1_800_000_001)).resolves.toMatchObject({ signer: created.signer });
      expect(localStorage.getItem('pubchi.deviceSigner')).toBe(created.signer);
      await Promise.resolve();
      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandledRejection);
      setItem.mockRestore();
    }
  });

  it('rejects a fourth live device signer', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const key = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
    await getPubchiDatabase().deviceKeys.bulkPut(
      [1, 2, 3].map((n) => ({
        id: `${OWNER}:device-${n}`,
        owner: OWNER,
        signer: `device-${n}`,
        key: (key as CryptoKeyPair).privateKey,
        created_at: 1,
        expires_at: 1_900_000_000,
      })),
    );
    await expect(loadOrGenerateDeviceKey(OWNER, 1_800_000_000)).rejects.toThrow('PUBCHI_DEVICE_LIMIT');
  });

  it('uses the cross-tab mint lock when available', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const request = vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback());
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    try {
      await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);
      expect(request).toHaveBeenCalledWith('pubchi-device-mint', expect.any(Function));
    } finally {
      Reflect.deleteProperty(navigator, 'locks');
    }
  });

  it('wipes local keys that belong to another identity', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const created = await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);
    const other = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    await getPubchiDatabase().deviceKeys.put({
      id: `${other}:foreign`,
      owner: other,
      signer: 'foreign',
      key: created.key,
      created_at: 1,
      expires_at: 1_900_000_000,
    });
    expect(await wipeDeviceKeysNotOwnedBy(OWNER)).toBe(1);
    expect(await getCurrentDeviceKey(OWNER, 1_800_000_001)).toMatchObject({ signer: created.signer });
    const leftover = await getPubchiDatabase().deviceKeys.where('owner').equals(other).toArray();
    expect(leftover).toEqual([]);
  });
});
