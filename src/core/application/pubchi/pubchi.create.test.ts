import { Keypair } from '@synonymdev/pubky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPubchiDatabase } from '@/database/pubchi/pubchi';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import * as deviceKey from '@/libs/pubchi/device-key';
import { delegationUri, signDeviceDelegationV1 } from '@/libs/pubchi/schemas/delegation';
import { botUri, ownerBindingsUri, ownerBindingUri } from '@/libs/pubchi/schemas/paths';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import type { PubchiBindingRecord } from '@/models/pubchi/binding.schema';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPubchiBindingService } from '@/services/local/pubchi/binding';
import { useAuthStore } from '@/stores/auth/auth.store';
import { PubchiApplication } from './pubchi';

const OWNER = Keypair.random().publicKey.z32();
const BOT = 'aihfhgdfshrj8nz9ofo7khayc1mgcqa4wrrdjahs5tmgo4pna3iy';
const OLD_BOT = Keypair.random().publicKey.z32();
const TEST_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const custodyMode = vi.hoisted(() => ({ real: false }));

vi.mock('@/libs/pubchi/bot-key-custody', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/pubchi/bot-key-custody')>();
  return {
    ...actual,
    mintBotKey: () => (custodyMode.real ? actual.mintBotKey() : { bot: BOT, phrase: TEST_PHRASE }),
  };
});

vi.mock('@/libs/pubchi/device-key', () => {
  const signer = Keypair.random().publicKey.z32();
  const key = crypto.subtle
    .generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
    .then((pair) => (pair as CryptoKeyPair).privateKey);
  return {
    DEVICE_DELEGATION_MAX_SECONDS: 7 * 24 * 60 * 60,
    DEVICE_DELEGATION_REFRESH_SECONDS: 3 * 24 * 60 * 60,
    loadOrGenerateDeviceKey: async () => ({
      key: await key,
      signer,
      id: `${OWNER}:${signer}`,
      owner: OWNER,
      created_at: 1,
      expires_at: 2_000_001,
    }),
    deleteDeviceKey: vi.fn(),
    getCurrentDeviceKey: vi.fn(),
    getDeviceKeys: vi.fn(async () => []),
    updateDeviceKeyExpiry: vi.fn(),
    listDeviceKeysNotOwnedBy: vi.fn(async () => []),
    wipeDeviceKeysNotOwnedBy: vi.fn(async () => 0),
    signWithDeviceKey: async (privateKey: CryptoKey, bytes: Uint8Array) =>
      Array.from(new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, new Uint8Array(bytes))), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
  };
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: () => ({
      selectSession: () => ({
        info: {
          capabilities: ['/:rw'],
          publicKey: { z32: () => OWNER },
        },
      }),
    }),
  },
}));

describe('PubchiApplication create protocol', () => {
  const documents = new Map<string, unknown>();
  const operations: string[] = [];

  beforeEach(() => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    documents.clear();
    operations.length = 0;
    custodyMode.real = false;
    vi.restoreAllMocks();
    vi.spyOn(LocalPubchiBindingService, 'readActive').mockResolvedValue(undefined);
    vi.spyOn(LocalPubchiBindingService, 'upsert').mockImplementation(async (value) => value);
    vi.spyOn(LocalPubchiBindingService, 'replaceActive').mockImplementation(async (value) => value);
    vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([]);
    vi.spyOn(HomeserverService, 'request').mockImplementation(async ({ method, url, bodyJson }) => {
      operations.push(`${method} ${url}`);
      if (method === HttpMethod.PUT) {
        documents.set(url, structuredClone(bodyJson));
        return undefined as never;
      }
      if (method === HttpMethod.GET) {
        if (!documents.has(url)) {
          throw Err.client(ClientErrorCode.NOT_FOUND, 'NOT_FOUND', {
            service: ErrorService.Pubchi,
            operation: 'test',
            context: { statusCode: 404 },
          });
        }
        return structuredClone(documents.get(url)) as never;
      }
      return undefined as never;
    });

    vi.spyOn(HomeserverService, 'getCurrentSessionInfo').mockImplementation(
      () => useAuthStore.getState().selectSession?.()?.info ?? null,
    );
    vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(async (url) =>
      JSON.stringify(await HomeserverService.request({ method: HttpMethod.GET, url })),
    );
    vi.spyOn(HomeserverService, 'createWriteFence').mockReturnValue({
      enter: () => undefined,
      assertCurrent: () => undefined,
    });
  });

  it('writes and reads back binding then pointer before delegation', async () => {
    const result = await PubchiApplication.createPubchi({
      owner: OWNER,
      displayName: 'Pubchi',
      capabilities: ['/:rw'],
    });

    expect(result.bot).toBe(BOT);
    expect(operations.indexOf(`PUT ${ownerBindingUri(OWNER, BOT)}`)).toBeLessThan(
      operations.indexOf(`PUT ${botUri(OWNER)}`),
    );
    expect(operations.indexOf(`PUT ${botUri(OWNER)}`)).toBeLessThan(
      operations.findIndex((operation) =>
        /^PUT pubky:\/\/.*\/pub\/app\.pubchi\/v1\/devices\/.*\.json$/.test(operation),
      ),
    );
    const delegation = [...documents.entries()].find(([url]) => url.includes('/devices/'))?.[1] as {
      bot: string;
      purposes: string[];
    };
    expect(delegation.bot).toBe(BOT);
    expect(delegation.purposes).toEqual(['ask', 'who-tagged-me', 'build-feed']);
  });

  it('aborts before bot.json when the binding read-back mismatches', async () => {
    vi.mocked(HomeserverService.request).mockImplementation(async ({ method, url, bodyJson }) => {
      operations.push(`${method} ${url}`);
      if (method === HttpMethod.PUT) documents.set(url, structuredClone(bodyJson));
      if (method === HttpMethod.GET && url === ownerBindingUri(OWNER, BOT)) {
        return { ...(documents.get(url) as object), status: 'revoked' } as never;
      }
      return structuredClone(documents.get(url)) as never;
    });

    await expect(
      PubchiApplication.createPubchi({ owner: OWNER, displayName: 'Pubchi', capabilities: ['/:rw'] }),
    ).rejects.toThrow('SCHEMA_INVALID');
    expect(operations).not.toContain(`PUT ${botUri(OWNER)}`);
  });

  it('fails before mint and writes nothing without capability coverage', async () => {
    await expect(
      PubchiApplication.createPubchi({
        owner: OWNER,
        displayName: 'Pubchi',
        capabilities: ['/pub/pubky.app/:rw'],
      }),
    ).rejects.toThrow('PATH_FORBIDDEN');
    expect(operations).toEqual([]);
  });

  it('refuses a second create and reconciles the active remote bot locally', async () => {
    const pointer = botDocument(OLD_BOT, 4);
    const binding = bindingDocument(OLD_BOT, 'active', 4);
    documents.set(botUri(OWNER), pointer);
    documents.set(ownerBindingUri(OWNER, OLD_BOT), binding);
    vi.mocked(HomeserverService.listAll).mockResolvedValue([ownerBindingUri(OWNER, OLD_BOT)]);

    await expect(
      PubchiApplication.createPubchi({ owner: OWNER, displayName: 'Ignored', capabilities: ['/:rw'] }),
    ).rejects.toThrow('PUBCHI_ALREADY_EXISTS');

    expect(LocalPubchiBindingService.replaceActive).toHaveBeenCalledWith(
      expect.objectContaining({ owner: OWNER, bot: OLD_BOT, status: 'active' }),
      expect.any(Function),
    );
    expect(operations.every((operation) => !operation.startsWith('PUT '))).toBe(true);
  });

  it('repairs a missing current-device delegation when create resumes an existing bot', async () => {
    const pointer = botDocument(OLD_BOT, 4);
    const binding = bindingDocument(OLD_BOT, 'active', 4);
    documents.set(botUri(OWNER), pointer);
    documents.set(ownerBindingUri(OWNER, OLD_BOT), binding);
    vi.mocked(HomeserverService.listAll).mockResolvedValue([ownerBindingUri(OWNER, OLD_BOT)]);
    vi.spyOn(LocalPubchiBindingService, 'readActive').mockResolvedValue({
      ...binding,
      id: `${OWNER}:${OLD_BOT}`,
    } as PubchiBindingRecord);
    const now = Math.floor(Date.now() / 1000);
    const device = {
      ...(await deviceKey.loadOrGenerateDeviceKey(OWNER, 1)),
      created_at: now - 1,
      expires_at: now + 30 * 24 * 60 * 60 - 1,
    };
    vi.mocked(deviceKey.getCurrentDeviceKey).mockResolvedValue(device);

    await expect(
      PubchiApplication.createPubchi({ owner: OWNER, displayName: 'Ignored', capabilities: ['/:rw'] }),
    ).rejects.toThrow('PUBCHI_ALREADY_EXISTS');

    const delegationPuts = operations.filter((operation) => operation === `PUT ${delegationUri(OWNER, device.signer)}`);
    expect(delegationPuts).toHaveLength(1);
    expect(documents.get(delegationUri(OWNER, device.signer))).toMatchObject({ bot: OLD_BOT });
  });

  it('does not rewrite an already current device delegation when create resumes', async () => {
    const pointer = botDocument(OLD_BOT, 4);
    const binding = bindingDocument(OLD_BOT, 'active', 4);
    documents.set(botUri(OWNER), pointer);
    documents.set(ownerBindingUri(OWNER, OLD_BOT), binding);
    vi.mocked(HomeserverService.listAll).mockResolvedValue([ownerBindingUri(OWNER, OLD_BOT)]);
    vi.spyOn(LocalPubchiBindingService, 'readActive').mockResolvedValue({
      ...binding,
      id: `${OWNER}:${OLD_BOT}`,
    } as PubchiBindingRecord);
    const now = Math.floor(Date.now() / 1000);
    const device = {
      ...(await deviceKey.loadOrGenerateDeviceKey(OWNER, 1)),
      created_at: now - 1,
      expires_at: now + 30 * 24 * 60 * 60 - 1,
    };
    vi.mocked(deviceKey.getCurrentDeviceKey).mockResolvedValue(device);
    const delegation = await signDeviceDelegationV1(
      {
        schema: 'pubchi-device-delegation',
        version: 1,
        owner: OWNER,
        signer: device.signer,
        bot: OLD_BOT,
        purposes: ['ask', 'who-tagged-me', 'build-feed'],
        created_at: device.created_at,
        expires_at: device.expires_at,
      },
      device.key,
    );
    documents.set(delegationUri(OWNER, device.signer), delegation);

    await expect(
      PubchiApplication.createPubchi({ owner: OWNER, displayName: 'Ignored', capabilities: ['/:rw'] }),
    ).rejects.toThrow('PUBCHI_ALREADY_EXISTS');

    expect(operations).not.toContain(`PUT ${delegationUri(OWNER, device.signer)}`);
  });

  it('repairs a missing current-device delegation while loading a verified bot', async () => {
    const pointer = botDocument(OLD_BOT, 4);
    const binding = bindingDocument(OLD_BOT, 'active', 4);
    documents.set(botUri(OWNER), pointer);
    documents.set(ownerBindingUri(OWNER, OLD_BOT), binding);
    vi.mocked(HomeserverService.listAll).mockResolvedValue([ownerBindingUri(OWNER, OLD_BOT)]);
    vi.spyOn(LocalPubchiBindingService, 'readActive').mockResolvedValue({
      ...binding,
      id: `${OWNER}:${OLD_BOT}`,
    } as PubchiBindingRecord);
    const now = Math.floor(Date.now() / 1000);
    const device = {
      ...(await deviceKey.loadOrGenerateDeviceKey(OWNER, 1)),
      created_at: now - 1,
      expires_at: now + 30 * 24 * 60 * 60 - 1,
    };
    vi.mocked(deviceKey.getCurrentDeviceKey).mockResolvedValue(device);

    await expect(PubchiApplication.loadPubchi(OWNER)).resolves.toMatchObject({ bot: OLD_BOT, verified: true });

    expect(operations.filter((operation) => operation === `PUT ${delegationUri(OWNER, device.signer)}`)).toHaveLength(
      1,
    );
    expect(documents.get(delegationUri(OWNER, device.signer))).toMatchObject({ bot: OLD_BOT });
  });

  it('gates legacy binding creation to the canonical bot', async () => {
    documents.set(botUri(OWNER), botDocument(OLD_BOT, 4));
    const loadDeviceSpy = vi.spyOn(deviceKey, 'loadOrGenerateDeviceKey');

    await expect(PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT })).rejects.toThrow(
      'PUBCHI_ALREADY_EXISTS',
    );

    expect(loadDeviceSpy).not.toHaveBeenCalled();
  });

  it('re-mints with a higher generation and preserves identity metadata', async () => {
    documents.set(botUri(OWNER), botDocument(OLD_BOT, 4));
    documents.set(ownerBindingUri(OWNER, OLD_BOT), bindingDocument(OLD_BOT, 'revoked', 4));
    vi.mocked(HomeserverService.listAll).mockResolvedValue([ownerBindingUri(OWNER, OLD_BOT)]);

    const result = await PubchiApplication.createPubchi({
      owner: OWNER,
      displayName: 'Ignored',
      capabilities: ['/:rw'],
    });

    expect(result).toMatchObject({ bot: BOT, displayName: 'Original', createdAt: 10 });
    expect(documents.get(botUri(OWNER))).toMatchObject({
      bot: BOT,
      key_generation: 5,
      display_name: 'Original',
      created_at: 10,
      backup_confirmed_at: null,
    });
    expect(documents.get(ownerBindingUri(OWNER, BOT))).toMatchObject({
      bot: BOT,
      key_generation: 5,
      created_at: 10,
    });
  });

  it('loads no bot, a missing binding, and a revoked binding without throwing', async () => {
    await expect(PubchiApplication.loadPubchi(OWNER)).resolves.toBeUndefined();

    documents.set(botUri(OWNER), botDocument(OLD_BOT, 2));
    await expect(PubchiApplication.loadPubchi(OWNER)).resolves.toMatchObject({ bot: OLD_BOT, verified: false });

    documents.set(ownerBindingUri(OWNER, OLD_BOT), bindingDocument(OLD_BOT, 'revoked', 2));
    await expect(PubchiApplication.loadPubchi(OWNER)).resolves.toMatchObject({ bot: OLD_BOT, verified: false });
  });

  it('tombstones an active listed orphan while loading the canonical bot', async () => {
    const orphan = Keypair.random().publicKey.z32();
    documents.set(botUri(OWNER), botDocument(OLD_BOT, 2));
    documents.set(ownerBindingUri(OWNER, OLD_BOT), bindingDocument(OLD_BOT, 'active', 2));
    documents.set(ownerBindingUri(OWNER, orphan), bindingDocument(orphan, 'active', 1));
    vi.mocked(HomeserverService.listAll).mockResolvedValue([
      ownerBindingUri(OWNER, OLD_BOT),
      ownerBindingUri(OWNER, orphan),
    ]);

    await expect(PubchiApplication.loadPubchi(OWNER)).resolves.toMatchObject({ bot: OLD_BOT, verified: true });
    expect(documents.get(ownerBindingUri(OWNER, orphan))).toMatchObject({ status: 'revoked' });
  });

  it('removes the binding before the canonical pointer and verifies both are absent', async () => {
    documents.set(botUri(OWNER), botDocument(OLD_BOT, 2));
    documents.set(ownerBindingUri(OWNER, OLD_BOT), bindingDocument(OLD_BOT, 'active', 2));
    vi.mocked(HomeserverService.request).mockImplementation(async ({ method, url, bodyJson }) => {
      operations.push(`${method} ${url}`);
      if (method === HttpMethod.DELETE) {
        documents.delete(url);
        return undefined as never;
      }
      if (method === HttpMethod.PUT) {
        documents.set(url, structuredClone(bodyJson));
        return undefined as never;
      }
      if (!documents.has(url)) {
        throw Err.client(ClientErrorCode.NOT_FOUND, 'NOT_FOUND', {
          service: ErrorService.Pubchi,
          operation: 'test',
          context: { statusCode: 404 },
        });
      }
      return structuredClone(documents.get(url)) as never;
    });

    await PubchiApplication.commitDeleteBinding({ owner: OWNER, bot: OLD_BOT });

    const bindingDelete = operations.indexOf(`DELETE ${ownerBindingUri(OWNER, OLD_BOT)}`);
    const pointerDelete = operations.indexOf(`DELETE ${botUri(OWNER)}`);
    expect(bindingDelete).toBeGreaterThanOrEqual(0);
    expect(pointerDelete).toBeGreaterThan(bindingDelete);
    expect(documents.has(ownerBindingUri(OWNER, OLD_BOT))).toBe(false);
    expect(documents.has(botUri(OWNER))).toBe(false);
  });

  it('fails closed before minting when the binding directory cannot be listed', async () => {
    vi.mocked(HomeserverService.listAll).mockRejectedValueOnce(new Error('listing unavailable'));
    await expect(
      PubchiApplication.createPubchi({ owner: OWNER, displayName: 'Pubchi', capabilities: ['/:rw'] }),
    ).rejects.toThrow('listing unavailable');
    expect(operations.every((operation) => !operation.startsWith('PUT '))).toBe(true);
  });

  it('does not persist the bot phrase in browser storage or any Pubchi Dexie table', async () => {
    custodyMode.real = true;
    localStorage.setItem('unrelated', 'safe');
    sessionStorage.setItem('unrelated', 'safe');
    const created = await PubchiApplication.createPubchi({
      owner: OWNER,
      displayName: 'Pubchi',
      capabilities: ['/:rw'],
    });

    const db = getPubchiDatabase();
    const tableValues = await Promise.all(db.tables.map((table) => table.toArray()));
    const inventory = JSON.stringify({
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
      documents: [...documents.values()],
      tableValues,
    });
    expect(inventory).not.toContain(created.phrase);
  });

  it('tombstones a remotely listed unreferenced binding before retrying creation', async () => {
    let botPutFailures = 1;
    vi.mocked(HomeserverService.listAll).mockImplementation(async () =>
      documents.has(ownerBindingUri(OWNER, BOT)) ? [ownerBindingUri(OWNER, BOT)] : [],
    );
    vi.mocked(HomeserverService.request).mockImplementation(async ({ method, url, bodyJson }) => {
      operations.push(`${method} ${url}`);
      if (method === HttpMethod.PUT && url === botUri(OWNER) && botPutFailures-- > 0) {
        throw Err.server(ServerErrorCode.BAD_GATEWAY, 'UPSTREAM_UNAVAILABLE', {
          service: ErrorService.Pubchi,
          operation: 'test',
          context: { statusCode: 502 },
        });
      }
      if (method === HttpMethod.GET && !documents.has(url)) {
        throw Err.client(ClientErrorCode.NOT_FOUND, 'NOT_FOUND', {
          service: ErrorService.Pubchi,
          operation: 'test',
          context: { statusCode: 404 },
        });
      }
      if (method === HttpMethod.PUT) {
        documents.set(url, structuredClone(bodyJson));
        return undefined as never;
      }
      return structuredClone(documents.get(url)) as never;
    });

    await expect(
      PubchiApplication.createPubchi({ owner: OWNER, displayName: 'Pubchi', capabilities: ['/:rw'] }),
    ).rejects.toThrow('UPSTREAM_UNAVAILABLE');
    await expect(
      PubchiApplication.createPubchi({ owner: OWNER, displayName: 'Pubchi', capabilities: ['/:rw'] }),
    ).resolves.toMatchObject({ bot: BOT, verified: true });

    const bindingWrites = vi
      .mocked(HomeserverService.request)
      .mock.calls.filter(([call]) => call.method === HttpMethod.PUT && call.url === ownerBindingUri(OWNER, BOT))
      .map(([call]) => (call.bodyJson as { status: string }).status);
    expect(bindingWrites).toEqual(['active', 'revoked', 'active']);
    expect(HomeserverService.listAll).toHaveBeenCalledWith({ baseDirectory: ownerBindingsUri(OWNER) });
  });
});

function botDocument(bot: string, keyGeneration: number) {
  return {
    schema: 'pubchi-bot',
    version: 1,
    bot,
    owner: OWNER,
    display_name: 'Original',
    created_at: 10,
    backup_confirmed_at: 20,
    homeserver_account: null,
    key_generation: keyGeneration,
  };
}

function bindingDocument(bot: string, status: 'active' | 'revoked', keyGeneration: number) {
  return {
    schema: 'pubchi-owner-binding',
    version: 1,
    owner: OWNER,
    bot,
    status,
    key_generation: keyGeneration,
    created_at: 10,
    updated_at: 20,
  };
}
