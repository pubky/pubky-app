import { Keypair } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import * as deviceKey from '@/libs/pubchi/device-key';
import {
  PENDING_DELEGATION_DELETES_KEY,
  PENDING_DELEGATION_DELETES_MAX,
  readPendingDelegationDeletes,
  rememberPendingDelegationDeletes,
} from '@/libs/pubchi/pending-delegation-deletes';
import { ERROR_CODES, type ErrorCode } from '@/libs/pubchi/schemas/codes';
import { delegationUri } from '@/libs/pubchi/schemas/delegation';
import { botUri, ownerBindingUri } from '@/libs/pubchi/schemas/paths';
import { parseQueryResultV1 } from '@/libs/pubchi/schemas/query';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { toast } from '@/molecules/Toaster/toast';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPubchiBindingService } from '@/services/local/pubchi/binding';
import { LocalPubchiRecordService } from '@/services/local/pubchi/records';
import { PubchiService } from '@/services/pubchi/pubchi';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  assertDeviceSignerIsPubkyId,
  assertRequestSignerIsStoredDevice,
  deleteDelegationRecord,
  isDrainTimeout,
  listKnownDelegations,
  PUBCHI_DELEGATION_DELETE_TIMEOUT_MS,
  PubchiApplication,
  refreshPublishedDelegation,
} from './pubchi';

vi.mock('@/molecules/Toaster/toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/libs/pubchi/device-key', () => {
  const signer = Keypair.random().publicKey.z32();
  const deviceKeyPromise = crypto.subtle
    .generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
    .then((pair) => ({ key: (pair as CryptoKeyPair).privateKey, signer }));
  const get = async () => {
    const { key } = await deviceKeyPromise;
    const now = Math.floor(Date.now() / 1000);
    return {
      key,
      signer,
      id: `test:${signer}`,
      owner: 'owner',
      created_at: now - 24 * 60 * 60,
      expires_at: now + 10 * 24 * 60 * 60,
    };
  };
  return {
    DEVICE_DELEGATION_MAX_SECONDS: 7 * 24 * 60 * 60,
    DEVICE_DELEGATION_REFRESH_SECONDS: 3 * 24 * 60 * 60,
    getCurrentDeviceKey: get,
    loadOrGenerateDeviceKey: get,
    getDeviceKeys: async () => [],
    updateDeviceKeyExpiry: async () => undefined,
    listDeviceKeysNotOwnedBy: async () => [],
    wipeDeviceKeysNotOwnedBy: async () => 0,
    deleteDeviceKey: async () => undefined,
    signWithDeviceKey: async (key: CryptoKey, message: Uint8Array) =>
      Array.from(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, new Uint8Array(message))), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
  };
});

const sessionIdentity = {
  pubky: '',
  capabilities: ['/pub/app.pubchi/v1/:rw'] as string[],
};

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: () => ({
      selectSession: () => ({
        info: {
          capabilities: sessionIdentity.capabilities,
          publicKey: { z32: () => sessionIdentity.pubky },
        },
      }),
    }),
  },
}));

const keypair = Keypair.random();
const OWNER = keypair.publicKey.z32();
const BOT = OWNER;

const ACTIVE_BINDING = {
  schema: 'pubchi-owner-binding' as const,
  version: 1 as const,
  owner: OWNER,
  bot: BOT,
  status: 'active' as const,
  created_at: 1,
  updated_at: 1,
  id: `${OWNER}:${BOT}`,
};

function notFoundError(): Error {
  return Err.client(ClientErrorCode.NOT_FOUND, 'NOT_FOUND', {
    service: ErrorService.Pubchi,
    operation: 'test',
    context: { statusCode: 404 },
  });
}

const QUERY_RESULT = {
  schema: 'pubchi-query-result',
  version: 1,
  bot: BOT,
  owner: OWNER,
  generated_at: 10,
  run_id: 'run1',
  purpose: 'who-tagged-me',
  scope_owner: OWNER,
  items: [
    {
      label: 'builder',
      source_uri: `pubky://${OWNER}/pub/pubky.app/tags/builder`,
      subject_uri: `pubky://${OWNER}/pub/pubky.app/profile.json`,
      claimant_count: 2,
    },
  ],
  tool_trace_summary: { tools: ['get_tag_landscape'], call_count: 1, truncated: false },
  policy_version: 1,
};

function setPubchiEnv(enabled = 'true', apiUrl = 'https://pubchi.example.com') {
  process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = enabled;
  process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = apiUrl;
  resetRuntimeConfigForTests();
}

describe('PubchiApplication', () => {
  beforeEach(() => {
    sessionIdentity.pubky = OWNER;
    sessionIdentity.capabilities = ['/pub/app.pubchi/v1/:rw'];
    setPubchiEnv();
    vi.spyOn(LocalPubchiBindingService, 'readActive').mockResolvedValue(ACTIVE_BINDING);
    vi.spyOn(LocalPubchiBindingService, 'read').mockResolvedValue(ACTIVE_BINDING);
    vi.spyOn(LocalPubchiBindingService, 'upsert').mockResolvedValue(ACTIVE_BINDING);
    vi.spyOn(LocalPubchiBindingService, 'replaceActive').mockResolvedValue(ACTIVE_BINDING);
    vi.spyOn(LocalPubchiBindingService, 'delete').mockResolvedValue(undefined);
    vi.spyOn(LocalPubchiBindingService, 'deleteNotOwnedBy').mockResolvedValue(0);
    vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    vi.mocked(toast).mockClear();
    localStorage.removeItem(PENDING_DELEGATION_DELETES_KEY);

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

  afterEach(() => {
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl];
    resetRuntimeConfigForTests();
    localStorage.removeItem(PENDING_DELEGATION_DELETES_KEY);
    vi.restoreAllMocks();
  });

  it('returns a parsed query result on the happy path', async () => {
    expect(parseQueryResultV1(QUERY_RESULT).ok).toBe(true);
    const querySpy = vi.spyOn(PubchiService, 'query').mockResolvedValue(QUERY_RESULT);

    const result = await PubchiApplication.query({
      isCurrent: () => true,
      owner: OWNER,
      question: 'who tagged me?',
      purpose: 'who-tagged-me',
      nowSeconds: 100,
    });

    expect(result.kind).toBe('query');
    expect(querySpy).toHaveBeenCalledOnce();
    const payload = querySpy.mock.calls[0][0];
    expect(payload.request.asker).toBe(OWNER);
    expect(payload.request.schema).toBe('pubchi-request-object-v2');
    expect(payload.request.version).toBe(2);
    expect(payload.request.audience).toBe('https://pubchi.example.com');
    expect(payload.request.context).toBeUndefined();
    expect(payload.request.signer).toMatch(/^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/);
    expect(payload.request.bot).toBe(BOT);
    expect(payload.request.purpose).toBe('who-tagged-me');
    expect(payload.body).toEqual({ question: 'who tagged me?' });
  });

  it('signs ask context but keeps who-tagged-me minimal', async () => {
    const querySpy = vi.spyOn(PubchiService, 'query').mockResolvedValue(QUERY_RESULT);
    const context = {
      schema: 'pubchi-owner-context' as const,
      version: 1 as const,
      about: 'Bitcoin',
      instructions: 'Answer briefly',
      updated_at: 100,
    };

    await PubchiApplication.query({
      isCurrent: () => true,
      owner: OWNER,
      question: 'what matters?',
      purpose: 'ask',
      context,
      nowSeconds: 100,
    });
    expect(querySpy.mock.calls[0][0].request.context).toEqual({
      about: 'Bitcoin',
      instructions: 'Answer briefly',
    });

    await PubchiApplication.query({
      isCurrent: () => true,
      owner: OWNER,
      question: 'who tagged me?',
      purpose: 'who-tagged-me',
      context,
      nowSeconds: 100,
    });
    expect(querySpy.mock.calls[1][0].request.context).toBeUndefined();
  });

  it('captures the signed ask body with its bounded conversation window', async () => {
    const querySpy = vi.spyOn(PubchiService, 'query').mockResolvedValue(QUERY_RESULT);
    await PubchiApplication.query({
      isCurrent: () => true,
      owner: OWNER,
      question: 'What about last month?',
      purpose: 'ask',
      conversation: {
        turns: [
          { role: 'user', text: 'Who is active?' },
          { role: 'assistant', text: 'From what I know, Alice is active.', basis: 'model' },
        ],
      },
      nowSeconds: 100,
    });
    expect(querySpy.mock.calls[0][0].body).toEqual({
      question: 'What about last month?',
      conversation: {
        turns: [
          { role: 'user', text: 'Who is active?' },
          { role: 'assistant', text: 'From what I know, Alice is active.', basis: 'model' },
        ],
      },
    });
  });

  it('loads private context through the authenticated homeserver path', async () => {
    sessionIdentity.capabilities = ['/pub/app.pubchi/v1/:rw', '/priv/app.pubchi/v1/:rw'];
    const context = {
      schema: 'pubchi-owner-context' as const,
      version: 1 as const,
      about: 'About',
      instructions: 'Instructions',
      updated_at: 10,
    };
    vi.mocked(HomeserverService.request).mockResolvedValueOnce(context);

    await expect(PubchiApplication.loadPubchiContext(OWNER)).resolves.toEqual(context);

    expect(HomeserverService.request).toHaveBeenCalledWith({
      method: HttpMethod.GET,
      url: `pubky://${OWNER}/priv/app.pubchi/v1/context.json`,
    });
  });

  it('writes and reads back private context through the authenticated path', async () => {
    sessionIdentity.capabilities = ['/pub/app.pubchi/v1/:rw', '/priv/app.pubchi/v1/:rw'];
    const context = {
      schema: 'pubchi-owner-context' as const,
      version: 1 as const,
      about: 'About',
      instructions: 'Instructions',
      updated_at: 10,
    };
    vi.mocked(HomeserverService.request)
      .mockRejectedValueOnce(notFoundError())
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async () => ({ ...context, updated_at: Math.floor(Date.now() / 1000) }));

    await expect(
      PubchiApplication.savePubchiContext(OWNER, { about: 'About', instructions: 'Instructions' }),
    ).resolves.toMatchObject({
      schema: context.schema,
      version: context.version,
      about: context.about,
      instructions: context.instructions,
    });

    expect(HomeserverService.request).toHaveBeenNthCalledWith(2, {
      fence: expect.objectContaining({ enter: expect.any(Function), assertCurrent: expect.any(Function) }),
      method: HttpMethod.PUT,
      url: `pubky://${OWNER}/priv/app.pubchi/v1/context.json`,
      bodyJson: expect.objectContaining({ about: 'About', instructions: 'Instructions' }),
    });
  });

  it('writes a first-use private cursor remotely after a 404', async () => {
    sessionIdentity.capabilities = ['/priv/app.pubchi/v1/:rw'];
    vi.mocked(HomeserverService.request).mockRejectedValueOnce(notFoundError()).mockResolvedValueOnce(undefined);

    await expect(PubchiApplication.savePubchiCursor(OWNER, '2026-09-10T07:00:00Z')).resolves.toBeUndefined();

    expect(HomeserverService.request).toHaveBeenNthCalledWith(2, {
      fence: expect.objectContaining({ enter: expect.any(Function), assertCurrent: expect.any(Function) }),
      method: HttpMethod.PUT,
      url: `pubky://${OWNER}/priv/app.pubchi/v1/cursor.json`,
      bodyJson: { cursor: '2026-09-10T07:00:00Z' },
    });
  });

  it('rereads private context extensions after a retryable publish conflict', async () => {
    vi.useFakeTimers();
    sessionIdentity.capabilities = ['/priv/app.pubchi/v1/:rw'];
    let remote = {
      schema: 'pubchi-owner-context',
      version: 1,
      about: 'old',
      instructions: '',
      updated_at: 1,
      extension: 1,
    };
    let writes = 0;
    vi.mocked(HomeserverService.request).mockImplementation(async ({ method, bodyJson }) => {
      if (method === HttpMethod.GET) return remote as never;
      if (++writes === 1) {
        remote = { ...remote, extension: 2 };
        throw Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'busy', {
          service: ErrorService.Homeserver,
          operation: 'test',
          context: { statusCode: 503 },
        });
      }
      remote = bodyJson as typeof remote;
      return undefined as never;
    });
    try {
      const assertion = expect(
        PubchiApplication.savePubchiContext(OWNER, { about: 'new', instructions: '' }),
      ).resolves.toMatchObject({ about: 'new', extension: 2 });
      await vi.runAllTimersAsync();
      await assertion;
      expect(writes).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops a context retry when its owner session was replaced', async () => {
    vi.useFakeTimers();
    sessionIdentity.capabilities = ['/priv/app.pubchi/v1/:rw'];
    vi.mocked(HomeserverService.createWriteFence).mockImplementation(() => {
      const captured = sessionIdentity.pubky;
      const assertCurrent = () => {
        if (sessionIdentity.pubky !== captured)
          throw Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Session ended', {
            service: ErrorService.Homeserver,
            operation: 'test',
          });
      };
      return { enter: assertCurrent, assertCurrent };
    });
    vi.mocked(HomeserverService.request).mockImplementation(async ({ method }) => {
      if (method === HttpMethod.GET)
        return { schema: 'pubchi-owner-context', version: 1, about: 'old', instructions: '', updated_at: 1 } as never;
      sessionIdentity.pubky = Keypair.random().publicKey.z32();
      throw Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'busy', {
        service: ErrorService.Homeserver,
        operation: 'test',
        context: { statusCode: 503 },
      });
    });
    try {
      const assertion = expect(
        PubchiApplication.savePubchiContext(OWNER, { about: 'new', instructions: '' }),
      ).rejects.toMatchObject({ code: AuthErrorCode.SESSION_EXPIRED });
      await vi.runAllTimersAsync();
      await assertion;
      expect(HomeserverService.request).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not overwrite a newer remote cursor', async () => {
    sessionIdentity.capabilities = ['/priv/app.pubchi/v1/:rw'];
    vi.mocked(HomeserverService.request).mockResolvedValueOnce({ cursor: '2026-09-10T08:00:00Z' });

    await expect(PubchiApplication.savePubchiCursor(OWNER, '2026-09-10T07:00:00+00:00')).resolves.toBeUndefined();

    expect(HomeserverService.request).toHaveBeenCalledTimes(1);
  });

  it('refuses to save a cursor for a foreign owner', async () => {
    sessionIdentity.capabilities = ['/priv/app.pubchi/v1/:rw'];

    await expect(PubchiApplication.savePubchiCursor('f'.repeat(52), '2026-09-10T07:00:00Z')).rejects.toThrow();

    expect(HomeserverService.request).not.toHaveBeenCalled();
  });

  it('treats private context authorization failures as an absent context', async () => {
    vi.mocked(HomeserverService.request).mockRejectedValueOnce({
      context: { statusCode: HttpStatusCode.FORBIDDEN },
    });

    await expect(PubchiApplication.loadPubchiContext(OWNER)).resolves.toBeNull();
  });

  it('allows read-only asks with a degraded session', async () => {
    sessionIdentity.capabilities = ['/pub/pubky.app/:rw'];
    const querySpy = vi.spyOn(PubchiService, 'query').mockResolvedValue(QUERY_RESULT);

    await expect(
      PubchiApplication.query({
        isCurrent: () => true,
        owner: OWNER,
        question: 'who tagged me?',
        purpose: 'who-tagged-me',
        nowSeconds: 100,
      }),
    ).resolves.toEqual({ kind: 'query', result: QUERY_RESULT });

    expect(querySpy).toHaveBeenCalledOnce();
  });

  it.each(ERROR_CODES)('surfaces error code %s and renders nothing else', async (code: ErrorCode) => {
    vi.spyOn(PubchiService, 'query').mockResolvedValue({ code });
    await expect(
      PubchiApplication.query({
        isCurrent: () => true,
        owner: OWNER,
        question: 'who tagged me?',
        purpose: 'who-tagged-me',
        nowSeconds: 100,
      }),
    ).rejects.toThrow(code);
  });

  it('rejects a malformed response', async () => {
    vi.spyOn(PubchiService, 'query').mockResolvedValue({ hello: 'world' });
    await expect(
      PubchiApplication.query({
        isCurrent: () => true,
        owner: OWNER,
        question: 'who tagged me?',
        purpose: 'who-tagged-me',
        nowSeconds: 100,
      }),
    ).rejects.toThrow('SCHEMA_INVALID');
  });

  it('does not query when the flag is off', async () => {
    setPubchiEnv('false', '');
    const querySpy = vi.spyOn(PubchiService, 'query');
    await expect(
      PubchiApplication.query({
        isCurrent: () => true,
        owner: OWNER,
        question: 'who tagged me?',
        purpose: 'who-tagged-me',
      }),
    ).rejects.toThrow('PUBCHI_DISABLED');
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('writes a validated owner binding to Dexie then the homeserver', async () => {
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockRejectedValueOnce(notFoundError());
    await PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT });
    expect(upsertSpy).toHaveBeenCalled();
    expect(requestSpy).toHaveBeenCalled();
    const firstPutIndex = requestSpy.mock.calls.findIndex(([request]) => request.method === HttpMethod.PUT);
    expect(firstPutIndex).toBeGreaterThanOrEqual(0);
    expect(upsertSpy.mock.invocationCallOrder[0]).toBeLessThan(requestSpy.mock.invocationCallOrder[firstPutIndex]);
  });

  it('accepts a feed proposal so the panel can show Apply', async () => {
    const feedProposal = {
      schema: 'pubchi-feed-proposal',
      version: 1,
      bot: BOT,
      owner: OWNER,
      generated_at: 10,
      feed: {
        name: 'Builders',
        created_at: 10,
        feed: {
          tags: ['builder'],
          reach: 'following',
          layout: 'columns',
          sort: 'recent',
        },
      },
      warnings: [],
      installed_user_feed_id: null,
    };
    vi.spyOn(PubchiService, 'query').mockResolvedValue(feedProposal);
    const result = await PubchiApplication.query({
      isCurrent: () => true,
      owner: OWNER,
      question: 'build a feed of builders',
      purpose: 'build-feed',
      nowSeconds: 100,
    });
    expect(result).toEqual({ kind: 'feed', result: feedProposal, applyAllowed: true });
    expect(vi.mocked(PubchiService.query).mock.calls[0][0].request.purpose).toBe('build-feed');
  });

  it.each(['what-i-missed', 'summarize'] as const)('refuses unserved purpose %s without a request', async (purpose) => {
    const querySpy = vi.spyOn(PubchiService, 'query');
    await expect(
      PubchiApplication.query({
        isCurrent: () => true,
        owner: OWNER,
        question: 'who tagged me in my feedreader?',
        purpose,
        nowSeconds: 100,
      }),
    ).rejects.toThrow('PURPOSE_UNSUPPORTED');
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('does not infer build-feed from the question text', async () => {
    vi.spyOn(PubchiService, 'query').mockResolvedValue(QUERY_RESULT);
    await PubchiApplication.query({
      isCurrent: () => true,
      owner: OWNER,
      question: 'who tagged me in my feedreader?',
      purpose: 'who-tagged-me',
      nowSeconds: 100,
    });
    expect(vi.mocked(PubchiService.query).mock.calls[0][0].request.purpose).toBe('who-tagged-me');
  });

  it('does not allow Apply for likes proposals', async () => {
    vi.spyOn(PubchiService, 'query').mockResolvedValue({
      schema: 'pubchi-feed-proposal',
      version: 1,
      bot: BOT,
      owner: OWNER,
      generated_at: 10,
      feed: {
        name: 'Likes',
        created_at: 10,
        feed: {
          tags: ['liked'],
          reach: 'likes',
          layout: 'columns',
          sort: 'recent',
        },
      },
      warnings: [],
      installed_user_feed_id: null,
    });
    const result = await PubchiApplication.query({
      isCurrent: () => true,
      owner: OWNER,
      question: 'build a feed of likes',
      purpose: 'build-feed',
      nowSeconds: 100,
    });
    expect(result).toEqual({ kind: 'feed-unsupported', code: 'FEED_UNSUPPORTED_LIKES' });
  });

  it('rejects a question longer than 500 characters', async () => {
    const querySpy = vi.spyOn(PubchiService, 'query');
    await expect(
      PubchiApplication.query({
        isCurrent: () => true,
        owner: OWNER,
        question: 'x'.repeat(501),
        purpose: 'who-tagged-me',
      }),
    ).rejects.toThrow('REQUEST_MALFORMED');
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('rolls back the Dexie row when homeserver PUT fails', async () => {
    vi.spyOn(LocalPubchiBindingService, 'read').mockResolvedValue(undefined);
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');
    const deleteSpy = vi.spyOn(LocalPubchiBindingService, 'delete');
    vi.spyOn(HomeserverService, 'request')
      .mockRejectedValueOnce(notFoundError())
      .mockRejectedValue(new Error('homeserver down'));

    await expect(PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT })).rejects.toThrow('homeserver down');
    expect(upsertSpy).toHaveBeenCalledOnce();
    expect(deleteSpy).toHaveBeenCalledWith(OWNER, BOT);
  });

  it('keeps the original write failure when local rollback also fails', async () => {
    vi.spyOn(LocalPubchiBindingService, 'read').mockResolvedValue(undefined);
    vi.spyOn(LocalPubchiBindingService, 'delete').mockRejectedValue(new Error('rollback failed'));
    const original = new Error('homeserver down');
    vi.spyOn(HomeserverService, 'request').mockRejectedValueOnce(notFoundError()).mockRejectedValue(original);

    const error = await PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT }).catch((value) => value);

    expect(error).toMatchObject({ message: 'homeserver down', cause: original });
    expect(error.context.rollbackError).toMatchObject({ message: 'rollback failed' });
  });

  it('records the delegation before deleting its local key when rollback DELETE fails', async () => {
    vi.spyOn(LocalPubchiBindingService, 'read').mockResolvedValue(undefined);
    const signer = Keypair.random().publicKey.z32();
    const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
    vi.spyOn(deviceKey, 'loadOrGenerateDeviceKey').mockResolvedValue({
      id: `${OWNER}:${signer}`,
      owner: OWNER,
      signer,
      key: keyPair.privateKey,
      created_at: 1,
      expires_at: 2_000_000_000,
    });
    const deleteKeySpy = vi.spyOn(deviceKey, 'deleteDeviceKey').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'request')
      .mockRejectedValueOnce(notFoundError())
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('binding write failed'))
      .mockRejectedValueOnce(new Error('delegation rollback failed'));

    await expect(PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT })).rejects.toThrow(
      'binding write failed',
    );

    expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer }]);
    expect(deleteKeySpy).toHaveBeenCalledWith(OWNER, signer);
  });

  it('does not delete the local row when homeserver removal fails', async () => {
    const deleteSpy = vi.spyOn(LocalPubchiBindingService, 'delete');
    vi.spyOn(HomeserverService, 'request').mockRejectedValue(new Error('homeserver down'));

    await expect(PubchiApplication.commitDeleteBinding({ owner: OWNER, bot: BOT })).rejects.toThrow('homeserver down');
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('deletes the requested remote binding and verifies absence before clearing local state', async () => {
    const requestSpy = vi.mocked(HomeserverService.request);
    requestSpy.mockImplementation(async ({ method }) => {
      if (method === HttpMethod.GET) throw notFoundError();
      return undefined;
    });
    const deleteSpy = vi.spyOn(LocalPubchiBindingService, 'delete');

    await PubchiApplication.commitDeleteBinding({ owner: OWNER, bot: BOT });

    expect(requestSpy).toHaveBeenCalledTimes(3);
    expect(requestSpy.mock.calls[1]?.[0]).toMatchObject({
      method: HttpMethod.DELETE,
      url: expect.stringContaining(`/bots/${BOT}.json`),
    });
    expect(requestSpy.mock.calls[2]?.[0]).toMatchObject({
      method: HttpMethod.GET,
      url: expect.stringContaining(`/bots/${BOT}.json`),
    });
    expect(deleteSpy).toHaveBeenCalledWith(OWNER, BOT);
  });

  it('marks the local row revoked when the homeserver binding is absent', async () => {
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(false);
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');
    await expect(PubchiApplication.reconcileActiveBinding(OWNER)).resolves.toBeUndefined();
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked', owner: OWNER, bot: BOT }));
  });

  it('keeps the local row when a 200 body fails parseOwnerBindingV1', async () => {
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(true);
    vi.spyOn(HomeserverService, 'request').mockResolvedValue('<html>proxy error</html>');
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');
    await expect(PubchiApplication.reconcileActiveBinding(OWNER)).resolves.toEqual(ACTIVE_BINDING);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('does not upsert a mismatched remote bot from reconcile', async () => {
    const otherBot = Keypair.random().publicKey.z32();
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(true);
    vi.spyOn(HomeserverService, 'request').mockResolvedValue({
      schema: 'pubchi-owner-binding',
      version: 1,
      owner: OWNER,
      bot: otherBot,
      status: 'active',
      created_at: 2,
      updated_at: 2,
    });
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');
    await expect(PubchiApplication.reconcileActiveBinding(OWNER)).resolves.toEqual(ACTIVE_BINDING);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('refuses enrollment when the session lacks the Pubchi capability', async () => {
    sessionIdentity.capabilities = ['/pub/pubky.app/:rw'];
    const requestSpy = vi.spyOn(HomeserverService, 'request');
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');
    await expect(PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT })).rejects.toThrow('PATH_FORBIDDEN');
    expect(requestSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('allows enrollment when the session has root /:rw', async () => {
    sessionIdentity.capabilities = ['/:rw'];
    const requestSpy = vi
      .spyOn(HomeserverService, 'request')
      .mockRejectedValueOnce(notFoundError())
      .mockResolvedValue(undefined);
    await expect(PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT })).resolves.toMatchObject({
      owner: OWNER,
      bot: BOT,
      status: 'active',
    });
    expect(requestSpy).toHaveBeenCalled();
  });

  it('allows enrollment when the session has /pub/:rw', async () => {
    sessionIdentity.capabilities = ['/pub/:rw'];
    vi.spyOn(HomeserverService, 'request').mockRejectedValueOnce(notFoundError()).mockResolvedValue(undefined);
    await expect(PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT })).resolves.toMatchObject({
      owner: OWNER,
      bot: BOT,
      status: 'active',
    });
  });

  it('refuses enrollment for near-miss and read-only covering scopes', async () => {
    for (const capability of [
      '/pub/app.pubchi/v1.evil/:rw',
      '/pub/app.pubchi/v1foo/:rw',
      '/:r',
      '/pub/app.pubchi/v1/:r',
    ]) {
      sessionIdentity.capabilities = [capability];
      await expect(PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT })).rejects.toThrow('PATH_FORBIDDEN');
    }
  });

  it('sets up a fresh browser once for a verified bot with root coverage', async () => {
    sessionIdentity.capabilities = ['/:rw'];
    const now = Math.floor(Date.now() / 1000);
    const pointer = {
      schema: 'pubchi-bot' as const,
      version: 1 as const,
      owner: OWNER,
      bot: BOT,
      display_name: 'Scout',
      created_at: now - 100,
      backup_confirmed_at: null,
      homeserver_account: null,
      key_generation: 1,
    };
    const remoteBinding = {
      schema: 'pubchi-owner-binding' as const,
      version: 1 as const,
      owner: OWNER,
      bot: BOT,
      status: 'active' as const,
      key_generation: 1,
      created_at: now - 100,
      updated_at: now - 100,
    };
    const device = await deviceKey.loadOrGenerateDeviceKey(OWNER, now);
    const loadDeviceSpy = vi.spyOn(deviceKey, 'loadOrGenerateDeviceKey').mockResolvedValue(device);
    let delegation: unknown;
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      const url = String(input.url);
      if (input.method === HttpMethod.GET && url === botUri(OWNER)) return pointer;
      if (input.method === HttpMethod.GET && url === ownerBindingUri(OWNER, BOT)) return remoteBinding;
      if (input.method === HttpMethod.GET && url === delegationUri(OWNER, device.signer)) {
        if (delegation) return delegation;
        throw notFoundError();
      }
      if (input.method === HttpMethod.PUT && url === delegationUri(OWNER, device.signer)) {
        delegation = input.bodyJson;
        return undefined;
      }
      return undefined;
    });

    await expect(
      Promise.all([PubchiApplication.ensureDeviceReady(OWNER), PubchiApplication.ensureDeviceReady(OWNER)]),
    ).resolves.toEqual([true, true]);
    expect(loadDeviceSpy).toHaveBeenCalledOnce();
    await expect(PubchiApplication.ensureDeviceReady(OWNER)).resolves.toBe(true);

    const delegationPuts = requestSpy.mock.calls.filter(
      ([input]) => input.method === HttpMethod.PUT && String(input.url) === delegationUri(OWNER, device.signer),
    );
    expect(delegationPuts).toHaveLength(1);
    expect(delegationPuts[0]?.[0].bodyJson).toMatchObject({
      bot: BOT,
      purposes: ['ask', 'who-tagged-me', 'build-feed'],
    });
    expect(requestSpy.mock.calls).toContainEqual([
      expect.objectContaining({ method: HttpMethod.GET, url: delegationUri(OWNER, device.signer) }),
    ]);
    expect(LocalPubchiBindingService.replaceActive).toHaveBeenCalledWith(
      expect.objectContaining({ owner: OWNER, bot: BOT, status: 'active' }),
      expect.any(Function),
    );
  });

  it('does not mint or publish when the session does not cover Pubchi', async () => {
    sessionIdentity.capabilities = ['/pub/pubky.app/:rw'];
    const now = Math.floor(Date.now() / 1000);
    const mintSpy = vi.spyOn(deviceKey, 'loadOrGenerateDeviceKey');
    vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (String(input.url) === botUri(OWNER)) {
        return {
          schema: 'pubchi-bot',
          version: 1,
          owner: OWNER,
          bot: BOT,
          display_name: 'Scout',
          created_at: now - 100,
          backup_confirmed_at: null,
          homeserver_account: null,
          key_generation: 1,
        };
      }
      return {
        schema: 'pubchi-owner-binding',
        version: 1,
        owner: OWNER,
        bot: BOT,
        status: 'active',
        key_generation: 1,
        created_at: now - 100,
        updated_at: now - 100,
      };
    });

    await expect(PubchiApplication.ensureDeviceReady(OWNER)).resolves.toBe(false);

    expect(mintSpy).not.toHaveBeenCalled();
    expect(HomeserverService.request).not.toHaveBeenCalledWith(expect.objectContaining({ method: HttpMethod.PUT }));
  });

  it('keeps setup disabled when delegation lookup fails', async () => {
    sessionIdentity.capabilities = ['/:rw'];
    const device = await deviceKey.loadOrGenerateDeviceKey(OWNER);
    const now = Math.floor(Date.now() / 1000);
    vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (String(input.url) === botUri(OWNER)) {
        return {
          schema: 'pubchi-bot',
          version: 1,
          owner: OWNER,
          bot: BOT,
          display_name: 'Scout',
          created_at: now - 100,
          backup_confirmed_at: null,
          homeserver_account: null,
          key_generation: 1,
        };
      }
      if (String(input.url) === ownerBindingUri(OWNER, BOT)) {
        return {
          schema: 'pubchi-owner-binding',
          version: 1,
          owner: OWNER,
          bot: BOT,
          status: 'active',
          key_generation: 1,
          created_at: now - 100,
          updated_at: now - 100,
        };
      }
      if (String(input.url) === delegationUri(OWNER, device.signer)) throw new Error('transport failure');
      return undefined;
    });

    await expect(PubchiApplication.ensureDeviceReady(OWNER)).resolves.toBe(false);
    expect(HomeserverService.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: HttpMethod.PUT, url: delegationUri(OWNER, device.signer) }),
    );
  });

  it('republishes a malformed delegation record', async () => {
    sessionIdentity.capabilities = ['/:rw'];
    const device = await deviceKey.loadOrGenerateDeviceKey(OWNER);
    const now = Math.floor(Date.now() / 1000);
    let delegation: unknown = { malformed: true };
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (String(input.url) === botUri(OWNER)) {
        return {
          schema: 'pubchi-bot',
          version: 1,
          owner: OWNER,
          bot: BOT,
          display_name: 'Scout',
          created_at: now - 100,
          backup_confirmed_at: null,
          homeserver_account: null,
          key_generation: 1,
        };
      }
      if (String(input.url) === ownerBindingUri(OWNER, BOT)) {
        return {
          schema: 'pubchi-owner-binding',
          version: 1,
          owner: OWNER,
          bot: BOT,
          status: 'active',
          key_generation: 1,
          created_at: now - 100,
          updated_at: now - 100,
        };
      }
      if (String(input.url) === delegationUri(OWNER, device.signer)) {
        if (input.method === HttpMethod.PUT) delegation = input.bodyJson;
        return delegation;
      }
      return undefined;
    });

    await expect(PubchiApplication.ensureDeviceReady(OWNER)).resolves.toBe(true);
    expect(requestSpy.mock.calls.filter(([input]) => input.method === HttpMethod.PUT)).toHaveLength(1);
  });

  it('does not mint when the owner has no bot pointer', async () => {
    const mintSpy = vi.spyOn(deviceKey, 'loadOrGenerateDeviceKey');
    vi.spyOn(HomeserverService, 'request').mockRejectedValue(notFoundError());

    await expect(PubchiApplication.ensureDeviceReady(OWNER)).resolves.toBe(false);

    expect(mintSpy).not.toHaveBeenCalled();
  });

  it('lists remote device delegations and durably revokes a non-local signer', async () => {
    const signer = Keypair.random().publicKey.z32();
    const delegation = {
      schema: 'pubchi-device-delegation' as const,
      version: 1 as const,
      owner: OWNER,
      signer,
      bot: BOT,
      purposes: ['ask', 'who-tagged-me', 'build-feed'] as const,
      created_at: 1,
      expires_at: 2_000_000,
      signature: 'a'.repeat(128),
    };
    vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([delegationUri(OWNER, signer)]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (input.method === HttpMethod.DELETE) return undefined;
      if (input.method === HttpMethod.GET && readPendingDelegationDeletes().length) throw notFoundError();
      return delegation;
    });
    const deleteLocalSpy = vi.spyOn(deviceKey, 'deleteDeviceKey').mockResolvedValue(undefined);

    await expect(PubchiApplication.listDeviceDelegations(OWNER)).resolves.toEqual([delegation]);
    await expect(PubchiApplication.revokeDevice(OWNER, signer)).resolves.toBeUndefined();

    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({ method: HttpMethod.DELETE, url: delegationUri(OWNER, signer) }),
    );
    expect(requestSpy).toHaveBeenCalledWith({ method: HttpMethod.GET, url: delegationUri(OWNER, signer) });
    expect(deleteLocalSpy).toHaveBeenCalledWith(OWNER, signer);
    expect(readPendingDelegationDeletes()).toEqual([]);
  });

  it('revokes locally without Pubchi coverage and defers the homeserver DELETE', async () => {
    const signer = Keypair.random().publicKey.z32();
    sessionIdentity.capabilities = ['/pub/pubky.app/:rw'];
    const requestSpy = vi.spyOn(HomeserverService, 'request');
    const deleteLocalSpy = vi.spyOn(deviceKey, 'deleteDeviceKey').mockResolvedValue(undefined);

    await expect(PubchiApplication.revokeDevice(OWNER, signer)).resolves.toBeUndefined();

    expect(deleteLocalSpy).toHaveBeenCalledWith(OWNER, signer);
    expect(requestSpy).not.toHaveBeenCalled();
    expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer }]);
  });

  it('keeps loaded devices when one delegation record fails', async () => {
    const goodSigner = Keypair.random().publicKey.z32();
    const goodDelegation = {
      schema: 'pubchi-device-delegation' as const,
      version: 1 as const,
      owner: OWNER,
      signer: goodSigner,
      bot: BOT,
      purposes: ['ask', 'who-tagged-me', 'build-feed'] as const,
      created_at: 1,
      expires_at: 2_000_000,
      signature: 'a'.repeat(128),
    };
    const badSigner = Keypair.random().publicKey.z32();
    vi.spyOn(HomeserverService, 'listAll').mockResolvedValue([
      delegationUri(OWNER, goodSigner),
      delegationUri(OWNER, badSigner),
    ]);
    vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (String(input.url) === delegationUri(OWNER, badSigner)) throw new Error('temporary failure');
      if (input.method === HttpMethod.DELETE) return undefined;
      if (input.method === HttpMethod.GET && readPendingDelegationDeletes().length) throw notFoundError();
      return goodDelegation;
    });

    await expect(PubchiApplication.listDeviceDelegations(OWNER)).resolves.toEqual([goodDelegation]);
    expect(PubchiApplication.hadDeviceListingFailures()).toBe(true);

    const result = await PubchiApplication.revokeAllDevices(OWNER);
    expect(result).toEqual({ revoked: [goodSigner], failed: [badSigner], unlisted: 1 });
    expect(readPendingDelegationDeletes()).toEqual(expect.arrayContaining([{ owner: OWNER, signer: badSigner }]));
  });

  it('rejects a request whose signer is not the stored device key', () => {
    expect(() => assertRequestSignerIsStoredDevice('b'.repeat(52), 'a'.repeat(52))).toThrow('DELEGATION_INVALID');
  });

  it('rejects a stored device signer that is not a pubky id', () => {
    expect(() => assertDeviceSignerIsPubkyId('../../pubky.app/profile', 'commitCreateBinding')).toThrow(
      'DELEGATION_INVALID',
    );
  });

  it('discards a planted Dexie signer and mints before the enrollment PUT', async () => {
    const planted = '../../pubky.app/profile';
    const deleteSpy = vi.spyOn(deviceKey, 'deleteDeviceKey').mockResolvedValue(undefined);
    vi.spyOn(deviceKey, 'loadOrGenerateDeviceKey').mockImplementationOnce(async () => ({
      id: `${OWNER}:${planted}`,
      owner: OWNER,
      signer: planted,
      key: {} as CryptoKey,
      created_at: Math.floor(Date.now() / 1000) - 24 * 60 * 60,
      expires_at: 2_000_000_000,
    }));
    const requestSpy = vi
      .spyOn(HomeserverService, 'request')
      .mockRejectedValueOnce(notFoundError())
      .mockResolvedValue(undefined);

    await PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT });

    expect(deleteSpy).toHaveBeenCalledWith(OWNER, planted);
    const urls = requestSpy.mock.calls.map((call) => String(call[0].url));
    expect(urls.every((url) => !url.includes('..'))).toBe(true);
    expect(urls.some((url) => url.includes('/pub/app.pubchi/v1/devices/'))).toBe(true);
  });

  it('DELETEs known delegations for a root /:rw session instead of skipping remote drain', async () => {
    sessionIdentity.capabilities = ['/:rw'];
    const signer = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      { id: `${OWNER}:${signer}`, owner: OWNER, signer, key: {} as CryptoKey, created_at: 1, expires_at: 2 },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    const result = await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true });
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: delegationUri(OWNER, signer),
      }),
    );
    expect(result).toEqual({ failed: [] });
  });

  it('DELETEs known delegation URIs and does not touch the owner binding', async () => {
    const signer = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      { id: `${OWNER}:${signer}`, owner: OWNER, signer, key: {} as CryptoKey, created_at: 1, expires_at: 2 },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await expect(PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true })).resolves.toEqual({
      failed: [],
    });
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: delegationUri(OWNER, signer),
      }),
    );
    expect(requestSpy.mock.calls.every((call) => !String(call[0].url).includes('/bots/'))).toBe(true);
    expect(readPendingDelegationDeletes()).toEqual([]);
  });

  it('records a failed DELETE so the next same-owner session can finish it', async () => {
    const signer = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      { id: `${OWNER}:${signer}`, owner: OWNER, signer, key: {} as CryptoKey, created_at: 1, expires_at: 2 },
    ]);
    vi.spyOn(HomeserverService, 'request').mockRejectedValue(new Error('homeserver unreachable'));

    await expect(PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true })).resolves.toEqual({
      failed: [{ owner: OWNER, signer }],
    });
    expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer }]);
  });

  it('retries a recorded DELETE for the signed-in owner during reconcile', async () => {
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: OWNER, signer }]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (input.method === 'DELETE') return undefined;
      return ACTIVE_BINDING;
    });
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(true);

    await PubchiApplication.reconcileActiveBinding(OWNER);
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: delegationUri(OWNER, signer),
      }),
    );
    expect(readPendingDelegationDeletes()).toEqual([]);
  });

  it('never DELETEs a planted path-injection signer', async () => {
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: OWNER, signer }]);
    localStorage.setItem(
      PENDING_DELEGATION_DELETES_KEY,
      JSON.stringify([
        { owner: OWNER, signer: '../../foo' },
        { owner: OWNER, signer },
      ]),
    );
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true });

    expect(requestSpy.mock.calls.every((call) => !String(call[0].url).includes('../../'))).toBe(true);
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: delegationUri(OWNER, signer),
      }),
    );
    expect(readPendingDelegationDeletes().some((item) => item.signer === '../../foo')).toBe(false);
  });

  it('bounds a never-resolving DELETE and keeps the pending record', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const signer = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      { id: `${OWNER}:${signer}`, owner: OWNER, signer, key: {} as CryptoKey, created_at: 1, expires_at: 2 },
    ]);
    vi.spyOn(HomeserverService, 'request').mockReturnValue(new Promise(() => {}));

    try {
      const result = PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true });
      await vi.advanceTimersByTimeAsync(PUBCHI_DELEGATION_DELETE_TIMEOUT_MS);
      await expect(result).resolves.toEqual({ failed: [{ owner: OWNER, signer }] });
      expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('wipes local keys from another identity and does not DELETE that identity remote delegation', async () => {
    const previousOwner = Keypair.random().publicKey.z32();
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: previousOwner, signer }]);
    vi.spyOn(deviceKey, 'listDeviceKeysNotOwnedBy').mockResolvedValue([
      {
        id: `${previousOwner}:${signer}`,
        owner: previousOwner,
        signer,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2,
      },
    ]);
    const wipeSpy = vi.spyOn(LocalPubchiRecordService, 'clearOwnerData').mockResolvedValue(undefined);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(true);

    await PubchiApplication.reconcileActiveBinding(OWNER);
    expect(wipeSpy).toHaveBeenCalledWith(previousOwner, expect.any(Function));
    expect(requestSpy.mock.calls.some((call) => String(call[0].url) === delegationUri(previousOwner, signer))).toBe(
      false,
    );
    expect(readPendingDelegationDeletes()).toEqual([{ owner: previousOwner, signer }]);
  });

  it('records a foreign device signer into that owner pending list before wipe without evicting current-owner records', async () => {
    const previousOwner = Keypair.random().publicKey.z32();
    const foreignSigner = Keypair.random().publicKey.z32();
    const currentSigners = Array.from({ length: 5 }, () => Keypair.random().publicKey.z32());
    rememberPendingDelegationDeletes(currentSigners.map((signer) => ({ owner: OWNER, signer })));

    const order: string[] = [];
    vi.spyOn(deviceKey, 'listDeviceKeysNotOwnedBy').mockImplementation(async () => {
      order.push('list');
      return [
        {
          id: `${previousOwner}:${foreignSigner}`,
          owner: previousOwner,
          signer: foreignSigner,
          key: {} as CryptoKey,
          created_at: 1,
          expires_at: 2,
        },
      ];
    });
    vi.spyOn(LocalPubchiRecordService, 'clearOwnerData').mockImplementation(async () => {
      order.push('wipe');
      return undefined;
    });
    vi.spyOn(PubchiApplication, 'unpublishKnownDelegations').mockResolvedValue({ failed: [] });
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(true);

    await PubchiApplication.reconcileActiveBinding(OWNER);

    expect(order).toEqual(['list', 'wipe']);
    const pending = readPendingDelegationDeletes();
    expect(pending).toEqual(
      expect.arrayContaining([
        { owner: previousOwner, signer: foreignSigner },
        ...currentSigners.map((signer) => ({ owner: OWNER, signer })),
      ]),
    );
    expect(pending.filter((item) => item.owner === OWNER)).toHaveLength(5);
  });

  it('does not evict a full current-owner pending list when a foreign signer cannot fit the cap', async () => {
    const previousOwner = Keypair.random().publicKey.z32();
    const foreignSigner = Keypair.random().publicKey.z32();
    const currentSigners = Array.from({ length: PENDING_DELEGATION_DELETES_MAX }, () =>
      Keypair.random().publicKey.z32(),
    );
    rememberPendingDelegationDeletes(currentSigners.map((signer) => ({ owner: OWNER, signer })));
    vi.spyOn(deviceKey, 'listDeviceKeysNotOwnedBy').mockResolvedValue([
      {
        id: `${previousOwner}:${foreignSigner}`,
        owner: previousOwner,
        signer: foreignSigner,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2,
      },
    ]);
    vi.spyOn(LocalPubchiRecordService, 'clearOwnerData').mockResolvedValue(undefined);
    vi.spyOn(PubchiApplication, 'unpublishKnownDelegations').mockResolvedValue({ failed: [] });
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(true);

    await PubchiApplication.reconcileActiveBinding(OWNER);

    const pending = readPendingDelegationDeletes();
    expect(pending).toHaveLength(PENDING_DELEGATION_DELETES_MAX);
    expect(pending.every((item) => item.owner === OWNER)).toBe(true);
    expect(pending.some((item) => item.signer === foreignSigner)).toBe(false);
  });

  it('refuses enrollment when the session pubky is not the binding owner before minting a device key', async () => {
    sessionIdentity.pubky = Keypair.random().publicKey.z32();
    sessionIdentity.capabilities = ['/pub/app.pubchi/v1/:rw', '/:rw'];
    const mintSpy = vi.spyOn(deviceKey, 'loadOrGenerateDeviceKey');
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');

    await expect(PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT })).rejects.toThrow('PATH_FORBIDDEN');
    expect(mintSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('does not DELETE or record the live device signer during reconcile', async () => {
    const liveSigner = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${liveSigner}`,
        owner: OWNER,
        signer: liveSigner,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2,
      },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (input.method === 'DELETE') return undefined;
      return ACTIVE_BINDING;
    });
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(true);

    await PubchiApplication.reconcileActiveBinding(OWNER);

    expect(requestSpy.mock.calls.some((call) => String(call[0].url) === delegationUri(OWNER, liveSigner))).toBe(false);
    expect(readPendingDelegationDeletes().some((item) => item.signer === liveSigner)).toBe(false);
  });

  it('retains a stored pending DELETE that names a currently-live device', async () => {
    const liveSigner = Keypair.random().publicKey.z32();
    const staleSigner = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([
      { owner: OWNER, signer: liveSigner },
      { owner: OWNER, signer: staleSigner },
    ]);
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${liveSigner}`,
        owner: OWNER,
        signer: liveSigner,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2,
      },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: false });

    expect(requestSpy.mock.calls.some((call) => String(call[0].url) === delegationUri(OWNER, liveSigner))).toBe(false);
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: delegationUri(OWNER, staleSigner),
      }),
    );
    expect(readPendingDelegationDeletes()).toEqual(expect.arrayContaining([{ owner: OWNER, signer: liveSigner }]));
    expect(readPendingDelegationDeletes().some((item) => item.signer === staleSigner)).toBe(false);
  });

  it('defers pending drain when live-device lookup fails and local keys must be preserved', async () => {
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: OWNER, signer }]);
    vi.spyOn(deviceKey, 'getDeviceKeys').mockRejectedValue(new Error('indexeddb unavailable'));
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await expect(
      PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: false }),
    ).resolves.toEqual({ failed: [{ owner: OWNER, signer }] });

    expect(requestSpy).not.toHaveBeenCalled();
    expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer }]);
  });

  it('still DELETEs the live device signer when the caller revokes local keys', async () => {
    const liveSigner = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${liveSigner}`,
        owner: OWNER,
        signer: liveSigner,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2,
      },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true });

    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: delegationUri(OWNER, liveSigner),
      }),
    );
  });

  it('never DELETEs a Dexie-planted path-injection signer', async () => {
    const botTraversal = '../bots/x';
    const profileTraversal = '../../pubky.app/profile';
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${botTraversal}`,
        owner: OWNER,
        signer: botTraversal,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2_000_000_000,
      },
      {
        id: `${OWNER}:${profileTraversal}`,
        owner: OWNER,
        signer: profileTraversal,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2_000_000_000,
      },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true });

    const urls = requestSpy.mock.calls.map((call) => String(call[0].url));
    expect(urls).toEqual([]);
  });

  it('listKnownDelegations keeps a valid Dexie signer', async () => {
    const signer = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${signer}`,
        owner: OWNER,
        signer,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2_000_000_000,
      },
    ]);

    await expect(listKnownDelegations(OWNER)).resolves.toEqual({
      kind: 'ok',
      items: [{ owner: OWNER, signer }],
    });
  });

  it('listKnownDelegations drops a Dexie-planted path-injection signer', async () => {
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:../bots/x`,
        owner: OWNER,
        signer: '../bots/x',
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2_000_000_000,
      },
    ]);

    await expect(listKnownDelegations(OWNER)).resolves.toEqual({ kind: 'ok', items: [] });
  });

  it('deleteDelegationRecord DELETEs a valid signer', async () => {
    const signer = Keypair.random().publicKey.z32();
    const deleteSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await deleteDelegationRecord({ owner: OWNER, signer });

    expect(deleteSpy).toHaveBeenCalledWith(
      expect.objectContaining({ method: HttpMethod.DELETE, url: delegationUri(OWNER, signer) }),
    );
  });

  it('deleteDelegationRecord rejects a path-injection signer before the homeserver call', async () => {
    const deleteSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await expect(deleteDelegationRecord({ owner: OWNER, signer: '../../pubky.app/profile' })).rejects.toThrow(
      'INVALID_PUBKY',
    );
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('retains a live-signer pending record across the multi-tab survivor sign-in', async () => {
    const liveSigner = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${liveSigner}`,
        owner: OWNER,
        signer: liveSigner,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2,
      },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockRejectedValue(new Error('homeserver unreachable'));

    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true });
    expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer: liveSigner }]);

    requestSpy.mockClear();
    requestSpy.mockResolvedValue(undefined);
    vi.mocked(toast).mockClear();
    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: false });

    expect(requestSpy.mock.calls.some((call) => String(call[0].url) === delegationUri(OWNER, liveSigner))).toBe(false);
    expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer: liveSigner }]);
    expect(toast).not.toHaveBeenCalled();

    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([]);
    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: false });
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: delegationUri(OWNER, liveSigner),
      }),
    );
    expect(readPendingDelegationDeletes()).toEqual([]);
  });

  it('treats a 404 DELETE as success and does not retry or toast', async () => {
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: OWNER, signer }]);
    vi.spyOn(HomeserverService, 'request').mockRejectedValue(
      Err.client(ClientErrorCode.NOT_FOUND, 'Not Found', {
        service: ErrorService.Homeserver,
        operation: 'delete',
        context: { statusCode: HttpStatusCode.NOT_FOUND },
      }),
    );

    await expect(
      PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: false }),
    ).resolves.toEqual({ failed: [] });
    expect(readPendingDelegationDeletes()).toEqual([]);
    expect(toast).not.toHaveBeenCalled();
  });

  it('retains a 403 DELETE silently without toasting', async () => {
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: OWNER, signer }]);
    vi.spyOn(HomeserverService, 'request').mockRejectedValue(
      Err.auth(AuthErrorCode.FORBIDDEN, 'Forbidden', {
        service: ErrorService.Homeserver,
        operation: 'delete',
        context: { statusCode: HttpStatusCode.FORBIDDEN },
      }),
    );

    await expect(
      PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: false }),
    ).resolves.toEqual({ failed: [{ owner: OWNER, signer }] });
    expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer }]);
    expect(toast).not.toHaveBeenCalled();
  });

  it('defers the drain when a Dexie device-key read hangs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: OWNER, signer }]);
    vi.spyOn(deviceKey, 'getDeviceKeys').mockReturnValue(new Promise(() => {}));
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    const errorSpy = vi.spyOn(Logger, 'error');

    try {
      const result = PubchiApplication.unpublishKnownDelegations(OWNER, {
        attemptRemote: true,
        includeLocalKeys: false,
      });
      await vi.advanceTimersByTimeAsync(PUBCHI_DELEGATION_DELETE_TIMEOUT_MS);
      await expect(result).resolves.toEqual({ failed: [{ owner: OWNER, signer }] });
      expect(requestSpy).not.toHaveBeenCalled();
      expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer }]);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(
        isDrainTimeout(
          new AppError({
            category: ErrorCategory.Timeout,
            code: TimeoutErrorCode.REQUEST_TIMEOUT,
            message: 'Pubchi device-key read timed out',
            service: ErrorService.Pubchi,
            operation: 'unpublishKnownDelegations',
          }),
        ),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('logout still revokes live device keys after retain-on-skip', async () => {
    const liveSigner = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${liveSigner}`,
        owner: OWNER,
        signer: liveSigner,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2,
      },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: true });

    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: delegationUri(OWNER, liveSigner),
      }),
    );
    expect(readPendingDelegationDeletes()).toEqual([]);
  });

  it('merges config fields and verifies the read-back', async () => {
    const config = {
      schema: 'pubchi-config',
      version: 1,
      bot: BOT,
      owner: OWNER,
      updated_at: 1,
      display_name: 'Existing name',
      tier: 'read-only',
      language: 'en',
      summary: { length: 'short', include_sources: true, include_disagreement: true },
      interests: { topics: [], excluded_topics: [] },
      proactive: { enabled: false, max_suggestions_per_day: 1, quiet_hours_utc: { start: 22, end: 7 } },
      follower_history_opt_in: false,
      brain: {
        adapter: 'vercel-ai',
        execution: 'synonym-hosted',
        provider_id: 'moonshot',
        model_id: 'kimi-k3',
        endpoint: null,
        send_public_graph_context: true,
        send_public_web_context: false,
      },
    } as const;
    const request = vi.mocked(HomeserverService.request);
    request.mockReset();
    const bot = {
      schema: 'pubchi-bot',
      version: 1,
      bot: BOT,
      owner: OWNER,
      display_name: 'Existing name',
      created_at: 1,
      backup_confirmed_at: null,
      homeserver_account: null,
      key_generation: 1,
    };
    let configReads = 0;
    request.mockImplementation(async ({ method, url }) => {
      if (method === HttpMethod.GET && url.endsWith('/config.json')) {
        configReads += 1;
        return configReads === 1
          ? config
          : { ...config, summary: { ...config.summary, length: 'long' }, updated_at: Math.floor(Date.now() / 1000) };
      }
      if (method === HttpMethod.GET && url.endsWith('/bot.json')) return bot;
      if (method === HttpMethod.GET) return config;
      return undefined;
    });

    await expect(
      PubchiApplication.savePubchiConfig(OWNER, { summary: { ...config.summary, length: 'long' } }),
    ).resolves.toMatchObject({
      display_name: 'Existing name',
      summary: { length: 'long' },
    });
    expect(request.mock.calls.some(([input]) => input.method === HttpMethod.PUT)).toBe(true);
  });

  it('does not put when the initial config get fails', async () => {
    const request = vi.mocked(HomeserverService.request);
    request.mockReset();
    request.mockRejectedValue(
      Err.auth(AuthErrorCode.FORBIDDEN, 'forbidden', {
        service: ErrorService.Homeserver,
        operation: 'request',
        context: { statusCode: HttpStatusCode.FORBIDDEN },
      }),
    );
    await expect(PubchiApplication.savePubchiConfig(OWNER, {})).rejects.toBeInstanceOf(AppError);
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'PUT' }));
  });

  it('throws when the read-back differs', async () => {
    const request = vi.mocked(HomeserverService.request);
    request.mockReset();
    request.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    await expect(PubchiApplication.savePubchiConfig(OWNER, {})).rejects.toBeInstanceOf(AppError);
  });

  it('refreshes a stale delegation while preserving its narrower purposes', async () => {
    const device = await deviceKey.getCurrentDeviceKey(OWNER);
    const stale = {
      schema: 'pubchi-device-delegation',
      version: 1,
      owner: OWNER,
      signer: device!.signer,
      bot: BOT,
      purposes: ['who-tagged-me'] as const,
      created_at: Math.floor(Date.now() / 1000) - 24 * 60 * 60,
      expires_at: Math.floor(Date.now() / 1000) + 10 * 24 * 60 * 60,
      signature: '0'.repeat(128),
    };
    const request = vi.mocked(HomeserverService.request);
    let published: unknown;
    request.mockReset();
    request.mockImplementation(async ({ method, bodyJson }) => {
      if (method === HttpMethod.GET) return published ?? stale;
      published = bodyJson;
      return undefined;
    });

    await refreshPublishedDelegation(OWNER);

    expect(published).toMatchObject({
      signer: device!.signer,
      purposes: ['who-tagged-me'],
    });
    expect(
      (published as { expires_at: number }).expires_at - (published as { created_at: number }).created_at,
    ).toBeLessThanOrEqual(7 * 24 * 60 * 60);
    expect(request.mock.calls.filter(([input]) => input.method === HttpMethod.PUT)).toHaveLength(1);
  });

  it('does not refresh a current delegation without Pubchi write coverage', async () => {
    sessionIdentity.capabilities = ['/pub/pubky.app/:rw'];
    const request = vi.mocked(HomeserverService.request);
    request.mockReset();

    await refreshPublishedDelegation(OWNER);

    expect(request).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('does not put a delegation that already has served purposes', async () => {
    const device = await deviceKey.getCurrentDeviceKey(OWNER);
    const now = Math.floor(Date.now() / 1000);
    const current = {
      schema: 'pubchi-device-delegation',
      version: 1,
      owner: OWNER,
      signer: device!.signer,
      bot: BOT,
      purposes: ['ask', 'who-tagged-me', 'build-feed'] as const,
      created_at: now - 24 * 60 * 60,
      expires_at: now + 10 * 24 * 60 * 60,
      signature: '0'.repeat(128),
    };
    const request = vi.mocked(HomeserverService.request);
    request.mockReset().mockResolvedValue(current);

    await refreshPublishedDelegation(OWNER);

    expect(request).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: HttpMethod.PUT }));
  });
});
