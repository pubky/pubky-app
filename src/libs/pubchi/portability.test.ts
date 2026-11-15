import { Keypair } from '@synonymdev/pubky';
import { describe, expect, it } from 'vitest';
import {
  buildExportBundle,
  hashDocumentBody,
  isHistoryPath,
  isPortableByDefault,
  parseExportBundle,
  pathFromOwnedUrl,
  planImport,
  publicListDirectories,
  reconstructFeedsFromBundle,
  serializeExportBundle,
  utf8ByteLength,
  verifyBundleHashes,
} from './portability';
import fixture from './schemas/__fixtures__/portability/export-bundle.json';
import { parsePubchiBotV1 } from './schemas/bot';
import { canonicalJson } from './schemas/canonical';
import { parsePubchiConfigV1 } from './schemas/config';
import { parseFeedProposal } from './schemas/feed';
import { PATHS } from './schemas/paths';

const OWNER = Keypair.random().publicKey.z32();
const BOT = Keypair.random().publicKey.z32();
const OTHER = Keypair.random().publicKey.z32();

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

const REQUEST_OBJECT = {
  schema: 'pubchi-request' as const,
  version: 1 as const,
  bot: BOT,
  owner: OWNER,
  request_id: 'req-1',
  purpose: 'ask' as const,
  created_at: 1_800_000_000,
  expires_at: 1_800_003_600,
  body_sha256: 'a'.repeat(64),
};

function docs() {
  return [
    { path: PATHS.bot, body: canonicalJson(BOT_OBJECT) },
    { path: PATHS.config, body: canonicalJson(CONFIG_OBJECT) },
    { path: `/pub/app.pubchi/v1/bots/${BOT}.json`, body: canonicalJson(BINDING_OBJECT) },
    { path: '/pub/app.pubchi/v1/feeds/builders.json', body: canonicalJson(FEED_OBJECT) },
  ];
}

describe('Pubchi portability', () => {
  it('keeps PATHS.manifest on the public v1 root', () => {
    expect(PATHS.manifest).toBe('/pub/app.pubchi/v1/manifest.json');
    expect(isPortableByDefault(PATHS.manifest)).toBe(true);
    expect(isHistoryPath('/pub/app.pubchi/v1/requests/req-1.json')).toBe(true);
    expect(isPortableByDefault('/pub/app.pubchi/v1/requests/req-1.json')).toBe(false);
    expect(publicListDirectories(false)).not.toContain('/pub/app.pubchi/v1/requests/');
    expect(publicListDirectories(true)).toContain('/pub/app.pubchi/v1/requests/');
  });

  it('parses live Keypair objects before hashing them', () => {
    expect(parsePubchiBotV1(BOT_OBJECT)).toEqual({ ok: true, value: BOT_OBJECT });
    expect(parsePubchiConfigV1(CONFIG_OBJECT)).toEqual({ ok: true, value: CONFIG_OBJECT });
    expect(parseFeedProposal(FEED_OBJECT).ok).toBe(true);
  });

  it('exports a deterministic bundle whose hashes match every manifest path', async () => {
    const built = await buildExportBundle(docs(), {
      bot: BOT,
      owner: OWNER,
      exportedAt: 1_800_000_000,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const hashes = await verifyBundleHashes(built.value);
    expect(hashes.ok).toBe(true);
    if (!hashes.ok) return;
    for (const entry of built.value.manifest.objects) {
      expect(hashes.value[entry.path]).toBe(entry.sha256);
      expect(utf8ByteLength(built.value.objects[entry.path])).toBe(entry.bytes);
      expect(await hashDocumentBody(built.value.objects[entry.path])).toBe(entry.sha256);
    }
    expect(built.value.objects[PATHS.manifest]).toBeDefined();
    const roundTrip = await parseExportBundle(JSON.parse(serializeExportBundle(built.value)));
    expect(roundTrip.ok).toBe(true);
    if (!roundTrip.ok) return;
    expect(roundTrip.value.manifest.objects.map((entry) => entry.sha256)).toEqual(
      built.value.manifest.objects.map((entry) => entry.sha256),
    );
  });

  it('reconstructs App feed create params from imported feed objects', async () => {
    const built = await buildExportBundle(docs(), { bot: BOT, owner: OWNER, exportedAt: 1 });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const feeds = reconstructFeedsFromBundle(built.value);
    expect(feeds).toEqual({
      ok: true,
      value: [
        {
          path: '/pub/app.pubchi/v1/feeds/builders.json',
          name: 'Builders',
          tags: ['builder'],
          canApply: true,
        },
      ],
    });
  });

  it('rejects a tampered body as BODY_HASH_MISMATCH', async () => {
    const built = await buildExportBundle(docs(), { bot: BOT, owner: OWNER, exportedAt: 1 });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const tampered = {
      ...built.value,
      objects: { ...built.value.objects, [PATHS.bot]: canonicalJson({ ...BOT_OBJECT, display_name: 'Nope' }) },
    };
    const verified = await verifyBundleHashes(tampered);
    expect(verified).toEqual({ ok: false, code: 'BODY_HASH_MISMATCH' });
  });

  it('rejects a bundle for another bot/owner pair', async () => {
    const built = await buildExportBundle(docs(), { bot: BOT, owner: OWNER, exportedAt: 1 });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(await planImport({ bundle: built.value, destinationOwner: OTHER, destinationBot: BOT })).toEqual({
      ok: false,
      code: 'BOT_MISMATCH',
    });
    expect(await planImport({ bundle: built.value, destinationOwner: OWNER, destinationBot: OTHER })).toEqual({
      ok: false,
      code: 'BOT_MISMATCH',
    });
  });

  it('excludes requests from the default bundle', async () => {
    const built = await buildExportBundle(
      [...docs(), { path: '/pub/app.pubchi/v1/requests/req-1.json', body: canonicalJson(REQUEST_OBJECT) }],
      { bot: BOT, owner: OWNER, exportedAt: 1 },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.objects['/pub/app.pubchi/v1/requests/req-1.json']).toBeUndefined();
    expect(built.value.manifest.objects.map((entry) => entry.path)).not.toContain(
      '/pub/app.pubchi/v1/requests/req-1.json',
    );
  });

  it('rejects encoded slashes, traversal, and /priv/ paths', async () => {
    const built = await buildExportBundle(
      [...docs(), { path: '/pub/app.pubchi/v1/../bot.json', body: canonicalJson(BOT_OBJECT) }],
      { bot: BOT, owner: OWNER, exportedAt: 1 },
    );
    expect(built.ok).toBe(false);
    const priv = await buildExportBundle(
      [...docs(), { path: '/priv/app.pubchi/v1/context.json', body: canonicalJson(BOT_OBJECT) }],
      { bot: BOT, owner: OWNER, exportedAt: 1 },
    );
    expect(priv).toEqual({ ok: false, code: 'PATH_FORBIDDEN' });
    expect(pathFromOwnedUrl(`pubky://${OWNER}/priv/app.pubchi/v1/context.json`, OWNER)).toBeUndefined();
  });

  it('plans an A to A-prime round-trip as adds when the destination is empty', async () => {
    const built = await buildExportBundle(docs(), { bot: BOT, owner: OWNER, exportedAt: 1 });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const plan = await planImport({ bundle: built.value, destinationOwner: OWNER, destinationBot: null });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.diff.every((entry) => entry.status === 'add')).toBe(true);
    expect(plan.value.hashes[PATHS.bot]).toHaveLength(64);
  });

  it('hashes the pinned real-object fixture identically after parse', async () => {
    const parsed = await parseExportBundle(fixture);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const hashes = await verifyBundleHashes(parsed.value);
    expect(hashes.ok).toBe(true);
    if (!hashes.ok) return;
    for (const entry of parsed.value.manifest.objects) {
      expect(hashes.value[entry.path]).toBe(entry.sha256);
    }
  });
});
