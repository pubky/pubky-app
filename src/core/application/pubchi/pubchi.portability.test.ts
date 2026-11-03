import { Keypair } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { canonicalJson } from '@/libs/pubchi/schemas/canonical';
import { PATHS } from '@/libs/pubchi/schemas/paths';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { PubchiApplication } from './pubchi';

const OWNER = Keypair.random().publicKey.z32();
const BOT = Keypair.random().publicKey.z32();
const OTHER = Keypair.random().publicKey.z32();

const sessionIdentity = {
  pubky: OWNER,
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

const BOT_OBJECT = {
  schema: 'pubchi-bot' as const,
  version: 1 as const,
  bot: BOT,
  owner: OWNER,
  display_name: 'Pubchi',
  created_at: 1_800_000_000,
  backup_confirmed_at: null,
  homeserver_account: null,
  key_generation: 1,
};

const CONFIG_OBJECT = {
  schema: 'pubchi-config' as const,
  version: 1 as const,
  bot: BOT,
  owner: OWNER,
  updated_at: 1_800_000_000,
  display_name: 'Pubchi',
  tier: 'read-only' as const,
  language: 'en',
  summary: { length: 'short' as const, include_sources: true, include_disagreement: true },
  interests: { topics: [], excluded_topics: [] },
  proactive: { enabled: false, max_suggestions_per_day: 1, quiet_hours_utc: { start: 22, end: 7 } },
  follower_history_opt_in: false,
  brain: {
    adapter: 'vercel-ai' as const,
    execution: 'synonym-hosted' as const,
    provider_id: 'moonshot' as const,
    model_id: 'kimi-k3',
    endpoint: null,
    send_public_graph_context: true,
    send_public_web_context: false,
  },
};

const BINDING_OBJECT = {
  schema: 'pubchi-owner-binding' as const,
  version: 1 as const,
  owner: OWNER,
  bot: BOT,
  status: 'active' as const,
  key_generation: 1,
  created_at: 1_800_000_000,
  updated_at: 1_800_000_000,
};

const FEED_OBJECT = {
  schema: 'pubchi-feed-proposal' as const,
  version: 1 as const,
  bot: BOT,
  owner: OWNER,
  generated_at: 1_800_000_000,
  feed: {
    name: 'Builders',
    created_at: 1_800_000_000,
    feed: { tags: ['builder'], reach: 'following', layout: 'columns' as const, sort: 'recent' },
  },
  warnings: [] as Array<'truncated-tags' | 'name-trimmed'>,
  installed_user_feed_id: null,
};

function notFoundError(): Error {
  return Err.client(ClientErrorCode.NOT_FOUND, 'NOT_FOUND', {
    service: ErrorService.Pubchi,
    operation: 'test',
    context: { statusCode: 404 },
  });
}

function seed(store: Map<string, string>): void {
  store.set(`pubky://${OWNER}${PATHS.bot}`, canonicalJson(BOT_OBJECT));
  store.set(`pubky://${OWNER}${PATHS.config}`, canonicalJson(CONFIG_OBJECT));
  store.set(`pubky://${OWNER}/pub/app.pubchi/v1/bots/${BOT}.json`, canonicalJson(BINDING_OBJECT));
  store.set(`pubky://${OWNER}/pub/app.pubchi/v1/feeds/builders.json`, canonicalJson(FEED_OBJECT));
}

describe('PubchiApplication portability', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    sessionIdentity.pubky = OWNER;
    sessionIdentity.capabilities = ['/pub/app.pubchi/v1/:rw'];
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = 'https://pubchi.example.com';
    resetRuntimeConfigForTests();
    seed(store);
    vi.spyOn(HomeserverService, 'listAll').mockImplementation(async ({ baseDirectory }) =>
      [...store.keys()].filter((url) => url.startsWith(baseDirectory)),
    );
    vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(async (url) => {
      const body = store.get(url);
      if (body === undefined) throw notFoundError();
      return body;
    });
    vi.spyOn(HomeserverService, 'putBlob').mockImplementation(async ({ url, blob }) => {
      store.set(url, new TextDecoder().decode(blob));
    });
    vi.spyOn(HomeserverService, 'request').mockImplementation(async ({ method, url, bodyJson }) => {
      if (method === HttpMethod.GET) {
        const body = store.get(url);
        if (body === undefined) throw notFoundError();
        return JSON.parse(body) as never;
      }
      if (method === HttpMethod.PUT && bodyJson) {
        store.set(url, canonicalJson(bodyJson));
      }
      return undefined as never;
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
    vi.restoreAllMocks();
  });

  it('exports public v1 documents and imports them with byte-identical hashes', async () => {
    const bundle = await PubchiApplication.exportPubchiState(OWNER);
    expect(bundle.bot).toBe(BOT);
    expect(bundle.owner).toBe(OWNER);
    expect(bundle.objects[PATHS.bot]).toBe(canonicalJson(BOT_OBJECT));
    const feeds = bundle.manifest.objects.filter((entry) => entry.path.startsWith('/pub/app.pubchi/v1/feeds/'));
    expect(feeds).toHaveLength(1);

    store.clear();
    const imported = await PubchiApplication.importPubchiState(OWNER, bundle);
    expect(imported.feeds).toEqual([
      {
        path: '/pub/app.pubchi/v1/feeds/builders.json',
        name: 'Builders',
        tags: ['builder'],
        canApply: true,
      },
    ]);
    for (const entry of bundle.manifest.objects) {
      expect(imported.hashes[entry.path]).toBe(entry.sha256);
      expect(store.get(`pubky://${OWNER}${entry.path}`)).toBe(bundle.objects[entry.path]);
    }
    expect(imported.hashes[PATHS.manifest]).toHaveLength(64);
    expect(store.get(`pubky://${OWNER}${PATHS.manifest}`)).toBe(bundle.objects[PATHS.manifest]);
    expect(
      vi.mocked(HomeserverService.listAll).mock.calls.every(([call]) => !call.baseDirectory.includes('/priv/')),
    ).toBe(true);
    expect(vi.mocked(HomeserverService.requestRawText).mock.calls.every(([url]) => !url.includes('/priv/'))).toBe(true);
    expect(vi.mocked(HomeserverService.putBlob).mock.calls.every(([call]) => !call.url.includes('/priv/'))).toBe(true);
  });

  it('rejects importing another owner bundle before any write', async () => {
    const bundle = await PubchiApplication.exportPubchiState(OWNER);
    store.clear();
    sessionIdentity.pubky = OTHER;
    await expect(PubchiApplication.importPubchiState(OTHER, bundle)).rejects.toThrow('BOT_MISMATCH');
    expect(vi.mocked(HomeserverService.putBlob)).not.toHaveBeenCalled();
  });

  it('skips /priv/ and history paths returned by listAll', async () => {
    store.set(`pubky://${OWNER}/priv/app.pubchi/v1/context.json`, '{"schema":"pubchi-owner-context"}');
    store.set(`pubky://${OWNER}/pub/app.pubchi/v1/requests/req-1.json`, '{"schema":"pubchi-request"}');
    const bundle = await PubchiApplication.exportPubchiState(OWNER);
    expect(Object.keys(bundle.objects).some((path) => path.includes('/priv/'))).toBe(false);
    expect(bundle.objects['/pub/app.pubchi/v1/requests/req-1.json']).toBeUndefined();
  });
});
