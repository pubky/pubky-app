import type { Session } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiApplication } from '@/application/pubchi/pubchi';
import { AuthController } from '@/controllers/auth/auth';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { PENDING_DELEGATION_DELETES_KEY, readPendingDelegationDeletes } from '@/libs/pubchi/pending-delegation-deletes';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthStore } from '@/stores/auth/auth.types';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { PubchiController } from './pubchi';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;
const BOT = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const OTHER = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Pubky;
let currentOwner: Pubky | null = OWNER;

class RecordingBroadcastChannel {
  static messages: unknown[] = [];

  constructor(readonly name: string) {}

  postMessage(message: unknown): void {
    expect(this.name).toBe('pubchi');
    RecordingBroadcastChannel.messages.push(message);
  }

  close(): void {}
}

const authState = {
  setSession: vi.fn(),
  session: undefined as Session | undefined,
};

function setPubchiEnv(enabled?: string, apiUrl?: string) {
  if (enabled === undefined) delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
  else process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = enabled;
  if (apiUrl === undefined) delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl];
  else process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = apiUrl;
  resetRuntimeConfigForTests();
}

function sessionFor(pubky: string, capabilities: string[] = []) {
  return asOpaque<Session>({
    info: { publicKey: { z32: () => pubky }, capabilities },
  });
}

describe('PubchiController', () => {
  beforeEach(() => {
    currentOwner = OWNER;
    usePubchiStore.getState().clear();
    authState.setSession.mockReset().mockImplementation((session: Session | null) => {
      authState.session = session ?? undefined;
    });
    authState.session = sessionFor(OWNER);
    RecordingBroadcastChannel.messages = [];
    vi.stubGlobal('BroadcastChannel', RecordingBroadcastChannel);
    vi.spyOn(PubchiApplication, 'unpublishKnownDelegations').mockResolvedValue({ failed: [] });
    vi.spyOn(useAuthStore, 'getState').mockReturnValue(
      asOpaque<AuthStore>({
        selectCurrentUserPubky: () => currentOwner!,
        get currentUserPubky() {
          return currentOwner;
        },
        session: authState.session,
        selectSession: () => authState.session,
        setSession: authState.setSession,
      }),
    );
  });

  afterEach(() => {
    setPubchiEnv();
    localStorage.removeItem(PENDING_DELEGATION_DELETES_KEY);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not call the application or network when the flag is off', async () => {
    setPubchiEnv('false');
    const querySpy = vi.spyOn(PubchiApplication, 'query');
    const createSpy = vi.spyOn(PubchiApplication, 'commitCreateBinding');
    const exportSpy = vi.spyOn(PubchiApplication, 'exportPubchiState');
    const importSpy = vi.spyOn(PubchiApplication, 'importPubchiState');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(PubchiController.getActiveBinding()).resolves.toBeUndefined();
    await expect(PubchiController.commitCreateBinding({ bot: BOT })).rejects.toThrow('PUBCHI_DISABLED');
    await expect(PubchiController.commitDeleteBinding()).rejects.toThrow('PUBCHI_DISABLED');
    await expect(PubchiController.fetchExportPubchi()).rejects.toThrow('PUBCHI_DISABLED');
    await expect(PubchiController.fetchImportPlan({})).rejects.toThrow('PUBCHI_DISABLED');
    await expect(PubchiController.commitImportPubchi({})).rejects.toThrow('PUBCHI_DISABLED');
    await expect(
      PubchiController.fetchPubchiQuery({
        question: 'who tagged me?',
        purpose: 'who-tagged-me',
      }),
    ).rejects.toThrow('PUBCHI_DISABLED');

    expect(querySpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(exportSpy).not.toHaveBeenCalled();
    expect(importSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never stores the recovery phrase returned by createPubchi', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    vi.spyOn(PubchiApplication, 'createPubchi').mockResolvedValue({
      bot: BOT,
      displayName: 'Bot',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
      phrase: 'secret phrase',
    });
    const snapshots: unknown[] = [];
    const unsubscribe = usePubchiStore.subscribe((state) => snapshots.push(state.pubchi));

    await PubchiController.createPubchi({ displayName: 'Bot' });

    unsubscribe();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).not.toHaveProperty('phrase');
    expect(usePubchiStore.getState().pubchi).not.toHaveProperty('phrase');
  });

  it('posts only the owner, kind, and timestamp after a successful controller write', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    vi.spyOn(PubchiApplication, 'createPubchi').mockResolvedValue({
      bot: BOT,
      displayName: 'Bot',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
      phrase: 'secret phrase',
    });

    await PubchiController.createPubchi({ displayName: 'Bot' });

    expect(RecordingBroadcastChannel.messages).toHaveLength(1);
    const message = RecordingBroadcastChannel.messages[0] as Record<string, unknown>;
    expect(Object.keys(message).sort()).toEqual(['at', 'kind', 'owner']);
    expect(message).toEqual({ owner: OWNER, kind: 'created', at: expect.any(Number) });
    expect(message).not.toHaveProperty('bot');
    expect(message).not.toHaveProperty('displayName');
    expect(message).not.toHaveProperty('phrase');
  });

  it('does not repopulate Pubchi after the owner changes during load', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    let resolveLoad!: (value: {
      bot: string;
      displayName: string;
      createdAt: number;
      backupConfirmedAt: null;
      verified: boolean;
    }) => void;
    vi.spyOn(PubchiApplication, 'loadPubchi').mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const loading = PubchiController.loadPubchi();
    currentOwner = null;
    resolveLoad({ bot: BOT, displayName: 'Old', createdAt: 1, backupConfirmedAt: null, verified: true });

    await loading;

    expect(usePubchiStore.getState().pubchi).toBeUndefined();
    expect(usePubchiStore.getState().ownerPubky).toBeNull();
  });

  it('passes an explicitly discovered binding bot to the application', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const deleteSpy = vi.spyOn(PubchiApplication, 'commitDeleteBinding').mockResolvedValue(undefined);
    const activeSpy = vi.spyOn(PubchiApplication, 'getActiveBinding');
    const loadSpy = vi.spyOn(PubchiApplication, 'loadPubchi');

    await PubchiController.commitDeleteBinding({ bot: BOT });

    expect(deleteSpy).toHaveBeenCalledWith({ owner: OWNER, bot: BOT });
    expect(activeSpy).not.toHaveBeenCalled();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('throws instead of silently succeeding when no binding bot is resolvable', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    vi.spyOn(PubchiApplication, 'getActiveBinding').mockResolvedValue(undefined);
    vi.spyOn(PubchiApplication, 'loadPubchi').mockResolvedValue(undefined);
    const deleteSpy = vi.spyOn(PubchiApplication, 'commitDeleteBinding');

    await expect(PubchiController.commitDeleteBinding()).rejects.toThrow('PUBCHI_NOT_FOUND');
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('fetchPubchiQuery delegates to the application when the panel is enabled', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const success = {
      kind: 'query' as const,
      result: { schema: 'pubchi-query-result' },
    };
    const querySpy = vi.spyOn(PubchiApplication, 'query').mockResolvedValue(success as never);
    await expect(
      PubchiController.fetchPubchiQuery({ question: 'who tagged me?', purpose: 'who-tagged-me' }),
    ).resolves.toEqual(success);
    expect(querySpy).toHaveBeenCalledWith({
      owner: OWNER,
      question: 'who tagged me?',
      purpose: 'who-tagged-me',
    });
  });

  it('fetchPubchiQuery forwards a non-empty conversation window for ask and drops an empty one', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const success = { kind: 'answer' as const, result: { schema: 'pubchi-answer' } };
    const querySpy = vi.spyOn(PubchiApplication, 'query').mockResolvedValue(success as never);
    const conversation = {
      turns: [
        { role: 'user' as const, text: 'Who are the most tagged users this week?' },
        { role: 'assistant' as const, text: 'Happy-Wolf-Flame received 3 tags.' },
      ],
    };
    await PubchiController.fetchPubchiQuery({ question: 'and what about last month?', purpose: 'ask', conversation });
    expect(querySpy).toHaveBeenLastCalledWith({
      owner: OWNER,
      question: 'and what about last month?',
      purpose: 'ask',
      conversation,
    });
    await PubchiController.fetchPubchiQuery({ question: 'how are you?', purpose: 'ask', conversation: { turns: [] } });
    expect(querySpy).toHaveBeenLastCalledWith({ owner: OWNER, question: 'how are you?', purpose: 'ask' });
  });

  it('commitCreateBinding rejects an invalid bot pubky before writing', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const createSpy = vi.spyOn(PubchiApplication, 'commitCreateBinding');
    await expect(PubchiController.commitCreateBinding({ bot: 'not-a-pubky' })).rejects.toThrow('INVALID_PUBKY');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('does not DELETE a UI-supplied path-injection signer', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const revokeSpy = vi.spyOn(PubchiApplication, 'revokeDevice');
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    await expect(PubchiController.revokeDevice('../bots/x')).rejects.toThrow('INVALID_PUBKY');
    await expect(PubchiController.revokeDevice('../../pubky.app/profile')).rejects.toThrow('INVALID_PUBKY');
    expect(revokeSpy).not.toHaveBeenCalled();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('delegates revoking all devices to the application layer', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const revokeAllSpy = vi
      .spyOn(PubchiApplication, 'revokeAllDevices')
      .mockResolvedValue({ revoked: [], failed: [], unlisted: 0 });

    await PubchiController.revokeAllDevices();

    expect(revokeAllSpy).toHaveBeenCalledWith(OWNER);
  });

  it('delegates capability upgrade and preserves cancellation and approval handles', async () => {
    const result = {
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: Promise.resolve(sessionFor(OWNER)),
      cancelAuthFlow: vi.fn(),
    };
    const request = vi.spyOn(AuthController, 'requestCapabilities').mockResolvedValue(result);
    await expect(PubchiController.getCapabilityApprovalUrl()).resolves.toBe(result);
    expect(request).toHaveBeenCalledWith(['/pub/pubky.app/:rw', '/pub/app.pubchi/v1/:rw', '/priv/app.pubchi/v1/:rw']);
  });

  it('reports an already-authorized grant without starting another approval', async () => {
    vi.spyOn(AuthController, 'requestCapabilities').mockResolvedValue(null);
    await expect(PubchiController.getCapabilityApprovalUrl()).resolves.toBeNull();
  });

  it('accepts the same-account session already adopted by the auth flow without bootstrapping it', async () => {
    const bootstrap = vi.spyOn(AuthController, 'initializeAuthenticatedSession');
    await expect(PubchiController.adoptCapabilityApproval(authState.session!)).resolves.toBeUndefined();
    expect(authState.setSession).not.toHaveBeenCalled();
    expect(bootstrap).not.toHaveBeenCalled();
  });

  it('rejects a foreign or superseded approval without mutating the active session', async () => {
    const pending = [{ owner: OWNER, signer: OWNER }];
    localStorage.setItem(PENDING_DELEGATION_DELETES_KEY, JSON.stringify(pending));
    for (const session of [sessionFor(OTHER), sessionFor(OWNER)]) {
      await expect(PubchiController.adoptCapabilityApproval(session)).rejects.toMatchObject({
        code: AuthErrorCode.FORBIDDEN,
      });
    }
    expect(authState.setSession).not.toHaveBeenCalled();
    expect(readPendingDelegationDeletes()).toEqual(pending);
  });

  it('forwards export and import to the application for the signed-in owner', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const bundle = { schema: 'pubchi-export-bundle', owner: OWNER, bot: BOT };
    const preview = { bundle, plan: { hashes: {} }, feeds: [] };
    const exported = vi.spyOn(PubchiApplication, 'exportPubchiState').mockResolvedValue(bundle as never);
    const planned = vi.spyOn(PubchiApplication, 'planImportPubchiState').mockResolvedValue(preview as never);
    const imported = vi
      .spyOn(PubchiApplication, 'importPubchiState')
      .mockResolvedValue({ ...preview, hashes: {} } as never);

    await expect(PubchiController.fetchExportPubchi({ includeHistory: false })).resolves.toBe(bundle);
    await expect(PubchiController.fetchImportPlan(bundle)).resolves.toBe(preview);
    await expect(PubchiController.commitImportPubchi(bundle)).resolves.toEqual({ ...preview, hashes: {} });
    expect(exported).toHaveBeenCalledWith(OWNER, { includeHistory: false });
    expect(planned).toHaveBeenCalledWith(OWNER, bundle);
    expect(imported).toHaveBeenCalledWith(OWNER, bundle);
  });
});
