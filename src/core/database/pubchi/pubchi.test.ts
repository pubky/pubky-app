import Dexie, { type Table } from 'dexie';
import { indexedDB } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { pubchiBindingTableSchema } from '@/models/pubchi/binding.schema';
import { pubchiDeviceKeyTableSchema } from '@/models/pubchi/device-key.schema';
import { pubchiFeedProvenanceTableSchema } from '@/models/pubchi/feed-provenance.schema';
import { clearPubchiOwnerData, deletePubchiDatabase, getPubchiDatabase, resetPubchiDatabaseForTests } from './pubchi';

class LegacyPubchiDatabase extends Dexie {
  bindings!: Table<unknown>;
  deviceKeys!: Table<unknown>;
  feedProvenance!: Table<unknown>;

  constructor() {
    super('pubchi');
    this.version(3).stores({
      bindings: pubchiBindingTableSchema,
      deviceKeys: pubchiDeviceKeyTableSchema,
      feedProvenance: pubchiFeedProvenanceTableSchema,
    });
  }
}

describe('deletePubchiDatabase', () => {
  afterEach(() => {
    resetPubchiDatabaseForTests();
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    resetRuntimeConfigForTests();
    vi.restoreAllMocks();
  });

  it('drops the pubchi IndexedDB without opening it', async () => {
    const deleteSpy = vi.spyOn(Dexie, 'delete').mockResolvedValue(undefined);
    await deletePubchiDatabase();
    expect(deleteSpy).toHaveBeenCalledWith('pubchi');
  });

  it('does not open an absent pubchi database when clearing owner data while disabled', async () => {
    vi.spyOn(Dexie, 'exists').mockResolvedValue(false);
    const openSpy = vi.spyOn(Dexie.prototype, 'open');

    await expect(clearPubchiOwnerData('owner-a')).resolves.toBeUndefined();

    expect(openSpy).not.toHaveBeenCalled();
  });

  it('resets the singleton even when Dexie.delete rejects', async () => {
    vi.spyOn(Dexie, 'delete').mockRejectedValue(new Error('idb gone'));
    await expect(deletePubchiDatabase()).rejects.toThrow('idb gone');
  });

  it('removes the v3 provenance table during the v4 upgrade', async () => {
    await deletePubchiDatabase();
    const legacy = new LegacyPubchiDatabase();
    const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
    await legacy.bindings.put({
      id: 'owner:bot',
      schema: 'pubchi-owner-binding',
      version: 1,
      owner: 'owner',
      bot: 'bot',
      status: 'active',
      created_at: 1,
      updated_at: 1,
    });
    await legacy.deviceKeys.put({
      id: 'owner:signer',
      owner: 'owner',
      signer: 'signer',
      key: keyPair.privateKey,
      created_at: 1,
      expires_at: 2,
    });
    await legacy.feedProvenance.put({
      id: 'owner:feed',
      owner: 'owner',
      feedId: 'feed',
      createdAt: 1,
    });
    legacy.close();

    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const db = getPubchiDatabase();
    await db.open();

    expect(legacy.isOpen()).toBe(false);
    expect(db.tables.map((table) => table.name)).not.toContain('feedProvenance');
    await expect(db.bindings.get('owner:bot')).resolves.toMatchObject({ owner: 'owner', bot: 'bot' });
    await expect(db.deviceKeys.get('owner:signer')).resolves.toMatchObject({ owner: 'owner', signer: 'signer' });
    await deletePubchiDatabase();
    expect(indexedDB).toBeDefined();
  });

  it('logs and recovers when another tab blocks the v4 upgrade', async () => {
    await deletePubchiDatabase();
    const legacy = new LegacyPubchiDatabase();
    await legacy.open();
    legacy.on('versionchange', () => false);

    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const warn = vi.spyOn(Logger, 'warn');
    const db = getPubchiDatabase();
    const blocked = new Promise<void>((resolve) => {
      db.on('blocked', () => resolve());
    });
    const opening = db.open();
    await blocked;
    legacy.close();

    await opening;

    expect(warn).toHaveBeenCalledWith('Pubchi database upgrade is blocked by another tab');
    expect(db.isOpen()).toBe(true);
    await deletePubchiDatabase();
  });

  it('enumerates every table and clears only owner-scoped records on identity clear', async () => {
    await deletePubchiDatabase();
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const db = getPubchiDatabase();
    await db.open();
    const owner = 'owner-a';
    const otherOwner = 'owner-b';
    const tablePolicies: Record<string, 'owner-scoped'> = {
      bindings: 'owner-scoped',
      deviceKeys: 'owner-scoped',
      tagApplications: 'owner-scoped',
      draftPosts: 'owner-scoped',
    };
    expect(db.tables.map((table) => table.name).every((name) => name in tablePolicies)).toBe(true);

    const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
    await db.bindings.bulkPut([
      {
        id: `${owner}:bot-a`,
        schema: 'pubchi-owner-binding',
        version: 1,
        owner,
        bot: 'bot-a',
        status: 'active',
        created_at: 1,
        updated_at: 1,
      },
      {
        id: `${otherOwner}:bot-b`,
        schema: 'pubchi-owner-binding',
        version: 1,
        owner: otherOwner,
        bot: 'bot-b',
        status: 'active',
        created_at: 1,
        updated_at: 1,
      },
    ]);
    await db.deviceKeys.bulkPut([
      { id: `${owner}:signer-a`, owner, signer: 'signer-a', key: keyPair.privateKey, created_at: 1, expires_at: 2 },
      {
        id: `${otherOwner}:signer-b`,
        owner: otherOwner,
        signer: 'signer-b',
        key: keyPair.privateKey,
        created_at: 1,
        expires_at: 2,
      },
    ]);
    await db.tagApplications.bulkPut([
      {
        id: 'application-a',
        owner,
        binding_id: 'application-a',
        bot: 'bot',
        served_purpose: 'ask',
        question: 'question',
        target: { kind: 'user', uri: 'pubky://owner/pub/pubky.app/profile.json' },
        submitted_at: Date.now(),
        response_run_id: 'run-a',
        response: {},
        suggestion_index: 0,
        status: 'proposed',
        updated_at: Date.now(),
      },
      {
        id: 'application-b',
        owner: otherOwner,
        binding_id: 'application-b',
        bot: 'bot',
        served_purpose: 'ask',
        question: 'question',
        target: { kind: 'user', uri: 'pubky://other/pub/pubky.app/profile.json' },
        submitted_at: Date.now(),
        response_run_id: 'run-b',
        response: {},
        suggestion_index: 0,
        status: 'proposed',
        updated_at: Date.now(),
      },
    ]);
    await db.draftPosts.bulkPut([
      {
        id: 'draft-a',
        owner,
        bot: 'bot',
        served_purpose: 'ask',
        question: 'draft a post',
        submitted_at: Date.now(),
        response_run_id: 'run-draft-a',
        response: {},
        status: 'proposed',
        updated_at: Date.now(),
      },
      {
        id: 'draft-b',
        owner: otherOwner,
        bot: 'bot',
        served_purpose: 'ask',
        question: 'draft a post',
        submitted_at: Date.now(),
        response_run_id: 'run-draft-b',
        response: {},
        status: 'proposed',
        updated_at: Date.now(),
      },
    ]);
    await clearPubchiOwnerData(owner);
    await expect(db.bindings.get(`${owner}:bot-a`)).resolves.toBeUndefined();
    await expect(db.bindings.get(`${otherOwner}:bot-b`)).resolves.toMatchObject({ owner: otherOwner });
    await expect(db.deviceKeys.get(`${owner}:signer-a`)).resolves.toBeUndefined();
    await expect(db.deviceKeys.get(`${otherOwner}:signer-b`)).resolves.toMatchObject({ owner: otherOwner });
    await expect(db.tagApplications.get('application-a')).resolves.toBeUndefined();
    await expect(db.tagApplications.get('application-b')).resolves.toMatchObject({ owner: otherOwner });
    await expect(db.draftPosts.get('draft-a')).resolves.toBeUndefined();
    await expect(db.draftPosts.get('draft-b')).resolves.toMatchObject({ owner: otherOwner });
    await deletePubchiDatabase();
  });
  it('purges only the retiring owner while disabled and keeps cleanup generation fenced', async () => {
    await deletePubchiDatabase();
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const db = getPubchiDatabase();
    const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
    await db.deviceKeys.bulkPut([
      {
        id: 'retiring:signer',
        owner: 'retiring',
        signer: 'signer',
        key: keyPair.privateKey,
        created_at: 1,
        expires_at: 2,
      },
      { id: 'active:signer', owner: 'active', signer: 'signer', key: keyPair.privateKey, created_at: 1, expires_at: 2 },
    ]);
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    resetRuntimeConfigForTests();
    await clearPubchiOwnerData('retiring', () => false);
    await expect(db.deviceKeys.count()).resolves.toBe(2);
    // Simulate an auth replacement while the existence check was awaited.
    let checks = 0;
    await clearPubchiOwnerData('retiring', () => ++checks < 3);
    await expect(db.deviceKeys.count()).resolves.toBe(2);
    await clearPubchiOwnerData('retiring', () => true);
    await expect(db.deviceKeys.get('retiring:signer')).resolves.toBeUndefined();
    await expect(db.deviceKeys.get('active:signer')).resolves.toMatchObject({ owner: 'active' });
    await deletePubchiDatabase();
  });
});
