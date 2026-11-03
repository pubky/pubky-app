import { Keypair } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import {
  clearProactiveLocalState,
  persistDismissedId,
  PROACTIVE_QUESTION,
  type ProactiveLockManager,
  proactiveLockName,
  proactiveSuggestionId,
  setProactiveLocksForTests,
  utcDayKey,
} from '@/libs/pubchi/proactive';
import type { PubchiAnswerV1 } from '@/libs/pubchi/schemas/answer';
import type { PubchiConfigV1 } from '@/libs/pubchi/schemas/config';
import { suggestionPath } from '@/libs/pubchi/schemas/paths';
import type { PubchiSuggestionV1 } from '@/libs/pubchi/schemas/suggestion';
import { suggestionFromAnswer } from '@/libs/pubchi/schemas/suggestion';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPubchiBindingService } from '@/services/local/pubchi/binding';
import { useAuthStore } from '@/stores/auth/auth.store';
import { PubchiApplication } from './pubchi';

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

const OWNER = Keypair.random().publicKey.z32();
const BOT = OWNER;
const noon = Date.UTC(2026, 8, 21, 12, 0, 0);
const quietHour = Date.UTC(2026, 8, 21, 23, 0, 0);
const suggestionId = proactiveSuggestionId(noon);
const sourceUri = `pubky://${OWNER}/pub/pubky.app/profile.json`;

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
    context: { statusCode: HttpStatusCode.NOT_FOUND },
  });
}

function serverError(): Error {
  return Err.server(ServerErrorCode.INTERNAL_ERROR, 'INTERNAL', {
    service: ErrorService.Pubchi,
    operation: 'test',
    context: { statusCode: 500 },
  });
}

function config(enabled: boolean): PubchiConfigV1 {
  return {
    schema: 'pubchi-config',
    version: 1,
    bot: BOT,
    owner: OWNER,
    updated_at: 1,
    display_name: 'Pubchi',
    tier: 'assisted',
    language: 'en',
    summary: { length: 'short', include_sources: true, include_disagreement: true },
    interests: { topics: [], excluded_topics: [] },
    proactive: { enabled, max_suggestions_per_day: 1, quiet_hours_utc: { start: 22, end: 7 } },
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
  };
}

function answer(): PubchiAnswerV1 {
  return {
    schema: 'pubchi-answer',
    version: 1,
    bot: BOT,
    owner: OWNER,
    generated_at: Math.floor(noon / 1000),
    run_id: 'proactive-run-1',
    purpose: 'ask',
    question: PROACTIVE_QUESTION,
    summary: 'Three threads in your graph are worth revisiting.',
    evidence: [
      {
        kind: 'user',
        label: 'Alice',
        uri: sourceUri,
        claimants: [OWNER],
        claimant_count: 2,
        in_your_graph: true,
      },
    ],
    sources: [sourceUri],
    tool_trace_summary: { tools: ['graph_search'], call_count: 1, truncated: false },
    policy_version: 1,
  };
}

function expectedSuggestion(): PubchiSuggestionV1 {
  const built = suggestionFromAnswer(answer(), { suggestionId, nowSeconds: Math.floor(noon / 1000) });
  if (!built) throw new Error('expected suggestion');
  return built;
}

function setPubchiEnv() {
  process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
  process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = 'https://pubchi.example.com';
  resetRuntimeConfigForTests();
}

describe('PubchiApplication app-open proactive', () => {
  const documents = new Map<string, string>();

  beforeEach(() => {
    sessionIdentity.pubky = OWNER;
    sessionIdentity.capabilities = ['/pub/app.pubchi/v1/:rw'];
    setPubchiEnv();
    documents.clear();
    localStorage.clear();
    vi.spyOn(LocalPubchiBindingService, 'readActive').mockResolvedValue(ACTIVE_BINDING);
    vi.spyOn(HomeserverService, 'listAll').mockImplementation(async ({ baseDirectory }) =>
      [...documents.keys()].filter((url) => url.startsWith(baseDirectory)),
    );
    vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(async (url) => {
      const body = documents.get(url);
      if (body === undefined) throw notFoundError();
      return body;
    });
    vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (input.method === HttpMethod.PUT && input.bodyJson) {
        documents.set(input.url, JSON.stringify(input.bodyJson));
      }
      return undefined;
    });

    vi.spyOn(HomeserverService, 'getCurrentSessionInfo').mockImplementation(
      () => useAuthStore.getState().selectSession?.()?.info ?? null,
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
    setProactiveLocksForTests(undefined);
    clearProactiveLocalState();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('writes suggestions/ from /v1/query and does not publish canonical objects', async () => {
    documents.set(`pubky://${OWNER}/pub/app.pubchi/v1/config.json`, JSON.stringify(config(true)));
    const query = vi.spyOn(PubchiApplication, 'query').mockResolvedValue({ kind: 'answer', result: answer() });

    const listed = await PubchiApplication.runAppOpenProactive(OWNER, noon, true);

    expect(query).toHaveBeenCalledWith({
      owner: OWNER,
      question: PROACTIVE_QUESTION,
      purpose: 'ask',
      nowSeconds: Math.floor(noon / 1000),
    });
    const put = vi.mocked(HomeserverService.request).mock.calls.find((call) => call[0].method === HttpMethod.PUT);
    expect(put?.[0].url).toBe(`pubky://${OWNER}${suggestionPath(suggestionId)}`);
    expect(put?.[0].url.includes('/pub/pubky.app/')).toBe(false);
    expect(put?.[0].url.includes('/priv/')).toBe(false);
    expect(listed).toEqual([expectedSuggestion()]);
  });

  it('skips the query during quiet hours, when capped, and when today is already written', async () => {
    documents.set(`pubky://${OWNER}/pub/app.pubchi/v1/config.json`, JSON.stringify(config(true)));
    const query = vi.spyOn(PubchiApplication, 'query').mockResolvedValue({ kind: 'answer', result: answer() });

    await PubchiApplication.runAppOpenProactive(OWNER, quietHour, true);
    expect(query).not.toHaveBeenCalled();

    await PubchiApplication.runAppOpenProactive(OWNER, noon, true);
    expect(query).toHaveBeenCalledTimes(1);

    query.mockClear();
    await PubchiApplication.runAppOpenProactive(OWNER, noon, true);
    expect(query).not.toHaveBeenCalled();
    expect(
      vi.mocked(HomeserverService.request).mock.calls.filter((call) => call[0].method === HttpMethod.PUT),
    ).toHaveLength(1);
  });

  it('does not PUT when GET of the existing object fails for a non-404 reason', async () => {
    vi.mocked(HomeserverService.requestRawText).mockRejectedValue(serverError());
    await expect(PubchiApplication.savePubchiSuggestion(OWNER, expectedSuggestion())).rejects.toMatchObject({
      context: { statusCode: 500 },
    });
    expect(vi.mocked(HomeserverService.request)).not.toHaveBeenCalled();
  });

  it('lets only one of two first-open tabs query and PUT', async () => {
    documents.set(`pubky://${OWNER}/pub/app.pubchi/v1/config.json`, JSON.stringify(config(true)));
    const held = new Set<string>();
    const locks: ProactiveLockManager = {
      request: async (name, _options, callback) => {
        if (held.has(name)) return callback(null);
        held.add(name);
        try {
          return await callback({ name });
        } finally {
          held.delete(name);
        }
      },
    };
    setProactiveLocksForTests(locks);
    expect(proactiveLockName(noon)).toBe(`pubchi-proactive-${utcDayKey(noon)}`);

    let releaseQuery: () => void = () => undefined;
    const queryHold = new Promise<void>((resolve) => {
      releaseQuery = resolve;
    });
    const query = vi.spyOn(PubchiApplication, 'query').mockImplementation(async () => {
      await queryHold;
      return { kind: 'answer', result: answer() };
    });

    const tab1 = PubchiApplication.runAppOpenProactive(OWNER, noon, true);
    const tab2 = PubchiApplication.runAppOpenProactive(OWNER, noon, true);
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    releaseQuery();
    await Promise.all([tab1, tab2]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(HomeserverService.request).mock.calls.filter((call) => call[0].method === HttpMethod.PUT),
    ).toHaveLength(1);
  });

  it('hides a dismissed suggestion without deleting the homeserver object', async () => {
    const body = JSON.stringify(expectedSuggestion());
    documents.set(`pubky://${OWNER}${suggestionPath(suggestionId)}`, body);
    persistDismissedId(OWNER, suggestionId);
    await expect(PubchiApplication.listProactiveSuggestions(OWNER, Math.floor(noon / 1000))).resolves.toEqual([]);
    expect(documents.get(`pubky://${OWNER}${suggestionPath(suggestionId)}`)).toBe(body);
  });
});
