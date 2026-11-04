import { Keypair, type Session } from '@synonymdev/pubky';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { deletePubchiDatabase, getPubchiDatabase } from '@/database/pubchi/pubchi';
import { AuthErrorCode } from '@/libs/error/error.codes';
import * as deviceKey from '@/libs/pubchi/device-key';
import type { PubchiAnswerV1 } from '@/libs/pubchi/schemas/answer';
import * as canonical from '@/libs/pubchi/schemas/canonical';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { LocalPubchiBindingService } from '@/services/local/pubchi/binding';
import { PubchiService } from '@/services/pubchi/pubchi';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AUTH_PERSIST_KEY, AUTH_STORE_VERSION } from '@/stores/persistedKeys';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { PubchiApplication } from './pubchi';

const owner = Keypair.random().publicKey.z32();
const otherOwner = Keypair.random().publicKey.z32();
const bot = Keypair.random().publicKey.z32();
const target = { kind: 'user' as const, uri: `pubky://${owner}/pub/pubky.app/profile.json` };
const kinds = ['draft', 'tag'] as const;
type QueryKind = (typeof kinds)[number];

vi.mock('@/libs/pubchi/device-key', () => ({
  getCurrentDeviceKey: async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
    return { key: pair.privateKey, signer: owner, owner, created_at: 1, expires_at: 2_000_000_000 };
  },
  signWithDeviceKey: async () => 'a'.repeat(128),
}));

function answer(kind: QueryKind): PubchiAnswerV1 {
  return {
    schema: 'pubchi-answer',
    version: 1,
    owner,
    bot,
    generated_at: Math.floor(Date.now() / 1000),
    run_id: `run-${kind}`,
    purpose: 'ask',
    question: 'Help me write about Pubky',
    summary: 'A suggestion based on your public profile.',
    evidence: [
      { kind: 'user', label: 'Owner profile', uri: target.uri, claimants: [], claimant_count: 0, in_your_graph: true },
    ],
    sources: [],
    tool_trace_summary: { tools: [], call_count: 0, truncated: false },
    policy_version: 1,
    ...(kind === 'draft'
      ? {
          section: 'draft_post' as const,
          draft_post: {
            content: 'Pubky keeps public social state on your homeserver.',
            kind: 'short' as const,
            tags: ['pubky-app'],
            rationale: 'Matches the public profile evidence.',
            evidence: [target.uri],
          },
        }
      : {
          section: 'tag_suggestions' as const,
          target: { ...target, snapshot_sha256: 'a'.repeat(64) },
          tag_suggestions: [
            {
              label: 'builder',
              rationale: 'Public evidence',
              evidence: [target.uri],
              already_applied: false,
              source: 'vocab' as const,
            },
          ],
        }),
  };
}

function query(kind: QueryKind) {
  return PubchiController.fetchPubchiQuery({
    question: answer(kind).question,
    purpose: 'ask',
    ...(kind === 'tag' ? { target } : {}),
  });
}

function adopt(pubky: string | null, generation: string) {
  const persisted = {
    currentUserPubky: pubky,
    generation,
    hasProfile: Boolean(pubky),
    sessionReference: null,
    retiringSession: null,
  };
  localStorage.setItem(AUTH_PERSIST_KEY, JSON.stringify({ version: AUTH_STORE_VERSION, state: persisted }));
  useAuthStore.getState().init({
    ...persisted,
    session: pubky ? asOpaque<Session>({ info: { publicKey: { z32: () => pubky }, capabilities: [] } }) : null,
  });
}

async function expectNoPrivateRecords() {
  const db = getPubchiDatabase();
  expect(await db.draftPosts.where('owner').equals(owner).count()).toBe(0);
  expect(await db.tagApplications.where('owner').equals(owner).count()).toBe(0);
}

describe('Pubchi query authentication lifetime', () => {
  beforeEach(async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = 'https://pubchi.example.com';
    resetRuntimeConfigForTests();
    useAuthStore.getState().setIsLoggingOut(false);
    adopt(owner, 'original-generation');
    await getPubchiDatabase().bindings.put({
      id: `${owner}:${bot}`,
      schema: 'pubchi-owner-binding',
      version: 1,
      owner,
      bot,
      status: 'active',
      created_at: 1,
      updated_at: 1,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    getPubchiDatabase().close();
    await deletePubchiDatabase();
    useAuthStore.getState().reset();
    useAuthStore.getState().setIsLoggingOut(false);
    localStorage.removeItem(AUTH_PERSIST_KEY);
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl];
    resetRuntimeConfigForTests();
  });

  describe.each(kinds)('%s response', (kind) => {
    it.each(['logout', 'replacement', 'away-and-back'] as const)(
      'does not recreate private records after %s cleanup',
      async (transition) => {
        const response = Promise.withResolvers<unknown>();
        const service = vi.spyOn(PubchiService, 'query').mockReturnValue(response.promise);
        const pending = query(kind);
        const settled = pending.then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
        await vi.waitFor(() => expect(service).toHaveBeenCalledOnce());

        adopt(transition === 'logout' ? null : otherOwner, 'replacement-generation');
        await PubchiApplication.clearOwnerData(owner);
        if (transition === 'away-and-back') adopt(owner, 'returned-generation');
        expect(await getPubchiDatabase().bindings.where('owner').equals(owner).count()).toBe(0);
        await expectNoPrivateRecords();

        response.resolve(answer(kind));
        await expect(settled).resolves.toMatchObject({ error: { code: AuthErrorCode.SESSION_EXPIRED } });
        await expectNoPrivateRecords();
      },
    );

    it.each(['logout', 'replacement', 'away-and-back'] as const)(
      'rejects after another tab persists %s and finishes cleanup before the storage event',
      async (transition) => {
        const response = Promise.withResolvers<unknown>();
        const service = vi.spyOn(PubchiService, 'query').mockReturnValue(response.promise);
        const pending = query(kind);
        const settled = pending.then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
        await vi.waitFor(() => expect(service).toHaveBeenCalledOnce());

        await AuthApplication.commitPersistedAuth(
          {
            currentUserPubky: transition === 'logout' ? null : otherOwner,
            generation: 'other-tab-transition',
            hasProfile: null,
            sessionReference: null,
            retiringSession: null,
          },
          'original-generation',
        );
        await PubchiApplication.clearOwnerData(owner);
        if (transition === 'away-and-back') {
          await AuthApplication.commitPersistedAuth(
            {
              currentUserPubky: owner,
              generation: 'other-tab-returned',
              hasProfile: true,
              sessionReference: null,
              retiringSession: null,
            },
            'other-tab-transition',
          );
        }
        // Durable auth changed, but this tab has not received its storage event yet.
        expect(AuthApplication.readPersistedAuth()?.generation).not.toBe('original-generation');
        expect(useAuthStore.getState()).toMatchObject({ currentUserPubky: owner, generation: 'original-generation' });
        expect(await getPubchiDatabase().bindings.where('owner').equals(owner).count()).toBe(0);
        await expectNoPrivateRecords();

        response.resolve(answer(kind));
        await expect(settled).resolves.toMatchObject({ error: { code: AuthErrorCode.SESSION_EXPIRED } });
        await expectNoPrivateRecords();
      },
    );

    it.each(['missing', 'malformed', 'unreadable'] as const)(
      'fails closed when persisted auth becomes %s during a query',
      async (state) => {
        const response = Promise.withResolvers<unknown>();
        const service = vi.spyOn(PubchiService, 'query').mockReturnValue(response.promise);
        const pending = query(kind);
        const settled = pending.then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
        await vi.waitFor(() => expect(service).toHaveBeenCalledOnce());
        await PubchiApplication.clearOwnerData(owner);
        if (state === 'missing') localStorage.removeItem(AUTH_PERSIST_KEY);
        else if (state === 'malformed') localStorage.setItem(AUTH_PERSIST_KEY, '{');
        else {
          const read = Storage.prototype.getItem;
          vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
            if (this === localStorage && key === AUTH_PERSIST_KEY) {
              throw new DOMException('Temporary localStorage read failure', 'UnknownError');
            }
            return read.call(this, key);
          });
        }

        response.resolve(answer(kind));
        await expect(settled).resolves.toMatchObject({ error: { code: AuthErrorCode.SESSION_EXPIRED } });
        await expectNoPrivateRecords();
      },
    );

    it('rejects if logout starts during response hashing', async () => {
      vi.spyOn(PubchiService, 'query').mockResolvedValue(answer(kind));
      const hash = Promise.withResolvers<string>();
      const hashing = vi.spyOn(canonical, 'sha256Hex').mockReturnValueOnce(hash.promise);
      const pending = query(kind);
      const settled = pending.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await vi.waitFor(() => expect(hashing).toHaveBeenCalledOnce());

      useAuthStore.getState().setIsLoggingOut(true);
      await PubchiApplication.clearOwnerData(owner);
      hash.resolve('a'.repeat(64));
      await expect(settled).resolves.toMatchObject({ error: { code: AuthErrorCode.SESSION_EXPIRED } });
      await expectNoPrivateRecords();
    });

    it.each(['this tab', 'another tab'] as const)('aborts a queued write when %s ends its generation', async (tab) => {
      const db = getPubchiDatabase();
      const response = Promise.withResolvers<unknown>();
      const service = vi.spyOn(PubchiService, 'query').mockReturnValue(response.promise);
      const pending = query(kind);
      const settled = pending.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await vi.waitFor(() => expect(service).toHaveBeenCalledOnce());

      // Hold an actual write transaction so cleanup and response persistence can queue.
      const release = Promise.withResolvers<void>();
      const started = Promise.withResolvers<void>();
      const blocker = db.transaction('rw', db.tables, async () => {
        await db.bindings.count();
        started.resolve();
        await Dexie.waitFor(release.promise);
      });
      await started.promise;
      const transaction = vi.spyOn(db, 'transaction');
      const cleanup = Dexie.ignoreTransaction(() => PubchiApplication.clearOwnerData(owner));
      try {
        await vi.waitFor(() => expect(transaction).toHaveBeenCalledOnce());
        const put = kind === 'draft' ? vi.spyOn(db.draftPosts, 'put') : vi.spyOn(db.tagApplications, 'put');
        response.resolve(answer(kind));
        await vi.waitFor(() => expect(put).toHaveBeenCalledOnce());

        // Both transactions are queued, but the response's initial guard has already passed.
        if (tab === 'this tab') adopt(null, 'logout-generation');
        else {
          await AuthApplication.commitPersistedAuth(
            {
              currentUserPubky: null,
              generation: 'other-tab-logout',
              hasProfile: null,
              sessionReference: null,
              retiringSession: null,
            },
            'original-generation',
          );
          expect(useAuthStore.getState().generation).toBe('original-generation');
        }
        release.resolve();
        await Promise.all([blocker, cleanup]);
        await expect(settled).resolves.toMatchObject({ error: { code: AuthErrorCode.SESSION_EXPIRED } });
        await expectNoPrivateRecords();
      } finally {
        response.resolve(answer(kind));
        release.resolve();
        await Promise.allSettled([blocker, cleanup, settled]);
      }
    });

    it('accepts a fresh query after a same-owner capability upgrade', async () => {
      vi.spyOn(PubchiService, 'query').mockResolvedValue(answer(kind));
      const conversation = [{ role: 'user' as const, text: 'Earlier question' }];
      usePubchiStore.setState({ ownerPubky: owner, conversation: { turns: conversation } });
      adopt(owner, 'upgraded-grant-generation');
      expect(AuthApplication.readPersistedAuth()?.generation).toBe('upgraded-grant-generation');

      const result = await query(kind);

      expect(result.kind).toBe('answer');
      expect(usePubchiStore.getState().conversation.turns).toEqual(conversation);
      const db = getPubchiDatabase();
      const table = kind === 'draft' ? db.draftPosts : db.tagApplications;
      expect(await table.where('owner').equals(owner).count()).toBe(1);
    });
  });

  it('rejects an empty bootstrap generation without persisted auth', async () => {
    adopt(owner, '');
    localStorage.removeItem(AUTH_PERSIST_KEY);
    const service = vi.spyOn(PubchiService, 'query');

    await expect(query('draft')).rejects.toMatchObject({ code: AuthErrorCode.SESSION_EXPIRED });

    expect(service).not.toHaveBeenCalled();
    await expectNoPrivateRecords();
  });

  it('captures the proactive generation before asynchronous preparation', async () => {
    const suggestions = Promise.withResolvers<[]>();
    const listing = vi.spyOn(PubchiApplication, 'listProactiveSuggestions').mockReturnValue(suggestions.promise);
    const loadConfig = vi.spyOn(PubchiApplication, 'loadPubchiConfig').mockResolvedValue(null);
    const service = vi.spyOn(PubchiService, 'query');
    const pending = PubchiController.runAppOpenProactive();
    await vi.waitFor(() => expect(listing).toHaveBeenCalledOnce());
    adopt(otherOwner, 'replacement-generation');
    await PubchiApplication.clearOwnerData(owner);
    adopt(owner, 'returned-generation');
    suggestions.resolve([]);

    await expect(pending).resolves.toEqual([]);
    expect(loadConfig).not.toHaveBeenCalled();
    expect(service).not.toHaveBeenCalled();
    await expectNoPrivateRecords();
  });

  it.each(['binding read', 'signing'] as const)('retains the generation before awaiting %s', async (stage) => {
    const resumed = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    if (stage === 'binding read') {
      const read = LocalPubchiBindingService.readActive.bind(LocalPubchiBindingService);
      vi.spyOn(LocalPubchiBindingService, 'readActive').mockImplementation(async (pubky) => {
        const binding = await read(pubky);
        started.resolve();
        await resumed.promise;
        return binding;
      });
    } else {
      vi.spyOn(deviceKey, 'signWithDeviceKey').mockImplementation(async () => {
        started.resolve();
        await resumed.promise;
        return 'a'.repeat(128);
      });
    }
    const service = vi.spyOn(PubchiService, 'query').mockResolvedValue(answer('draft'));
    const pending = query('draft');
    const settled = pending.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await started.promise;
    adopt(otherOwner, 'replacement-generation');
    await PubchiApplication.clearOwnerData(owner);
    adopt(owner, 'returned-generation');
    resumed.resolve();

    await expect(settled).resolves.toMatchObject({ error: { code: AuthErrorCode.SESSION_EXPIRED } });
    expect(service).not.toHaveBeenCalled();
    await expectNoPrivateRecords();
  });
});
