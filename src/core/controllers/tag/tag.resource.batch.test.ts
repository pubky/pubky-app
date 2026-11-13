import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { nexusQueryClient as TNexusQueryClient } from '@/services/nexus/nexus.query-client';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { resourceApi } from '@/services/nexus/resource/resource.api';
import { RESOURCE_BY_IDS_MAX, RESOURCE_TAGS_LIMIT } from '@/services/nexus/resource/resource.constants';
import type { TagController as TTagController } from './tag';

/**
 * A feed's cards reading their tags through the real batch (`TagController` → `TagApplication` →
 * `NexusResourceService`), only `fetch` mocked: as `ResourceActions` does once a card is on screen, each
 * card reads its own link (with its spellings) and its other links (`byIdsOnly`) at the same moment.
 */

// The batch and the shared answers are module state: every test reads fresh modules.
let TagController: typeof TTagController;
let nexusQueryClient: typeof TNexusQueryClient;

beforeEach(async () => {
  vi.resetModules();
  ({ TagController } = await import('./tag'));
  ({ nexusQueryClient } = await import('@/services/nexus/nexus.query-client'));
});

const VIEWER = 'viewer';
const CARDS = 50;
// The other links the feed's cards share: services several cards are also on.
const POOL = 120;
const BY_IDS_URL = resourceApi.byIds({ uris: [], limit_tags: RESOURCE_TAGS_LIMIT }).url;

const ownUri = (index: number) => `https://musicbrainz.org/release-group/${index}`;
const poolUri = (index: number) => `https://open.spotify.com/album/${index}`;

/** A card: its own link, the link as its post wrote it, and its other links, overlapping other cards'. */
const cards = Array.from({ length: CARDS }, (_, index) => ({
  uri: ownUri(index),
  spellings: [`${ownUri(index)}?tab=overview`],
  others: [
    poolUri(index % POOL),
    poolUri((index * 7 + 3) % POOL),
    poolUri((index + CARDS) % POOL),
    // Another card of the feed is that link itself: already read with the cards' own links.
    ownUri((index + 1) % CARDS),
    // Listed twice on the card.
    poolUri(index % POOL),
  ],
}));

const tag = (label: string): NexusTag => ({
  label,
  taggers: ['a'],
  taggers_count: 1,
  relationship: false,
  tag_uri: null,
});
// Nexus has tags on every other pool link and every third card's own link; it skips the rest.
const isTagged = (uri: string) => /album\/\d*[02468]$/.test(uri) || /group\/\d*[0369]$/.test(uri);
const view = (uri: string) => ({
  details: { id: uri, uri, scheme: 'https', indexed_at: 1 },
  tags: [tag(uri.includes('spotify') ? 'album' : 'rock')],
  taggers_count: 1,
  replies_count: 0,
  embeds_count: 0,
  collections_count: 0,
});
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fetchSpy = vi.spyOn(globalThis, 'fetch');
const posts = () => fetchSpy.mock.calls.filter(([url]) => String(url) === BY_IDS_URL);
const gets = () => fetchSpy.mock.calls.filter(([url]) => String(url).includes('/v0/resource/by-uri'));
const bodyOf = (call: unknown[]) =>
  JSON.parse(String((call[1] as RequestInit).body)) as { uris: string[]; viewer_id?: string };

type TCard = { uri: string; spellings: string[]; others: string[] };

/** Cards mounted together read their own tags and, with `withOthers`, their other links at the same moment. */
async function readFeed({ withOthers }: { withOthers: boolean }, mounted: TCard[] = cards) {
  await Promise.all(
    mounted.flatMap((card) => [
      TagController.fetchResourceTags({ uri: card.uri, viewerId: VIEWER, spellings: card.spellings }).catch(() => []),
      ...(withOthers
        ? card.others.map((uri) => TagController.fetchResourceTags({ uri, viewerId: VIEWER, byIdsOnly: true }))
        : []),
    ]),
  );
}

const reloadModules = async () => {
  vi.resetModules();
  ({ TagController } = await import('./tag'));
  ({ nexusQueryClient } = await import('@/services/nexus/nexus.query-client'));
};

describe('a feed of 50 cards reading the tags on their other links', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
  });

  afterEach(() => {
    nexusQueryClient.clear();
  });

  const answerByIds = () =>
    fetchSpy.mockImplementation(async (url, init) => {
      if (String(url) !== BY_IDS_URL) return new Response('', { status: 404 });
      const { uris } = JSON.parse(String(init?.body)) as { uris: string[] };
      return jsonResponse(uris.filter(isTagged).map(view));
    });
  // 50 cards, each on one other service of its own: 50 own links and 50 other links.
  const pairs: TCard[] = Array.from({ length: CARDS }, (_, index) => ({
    uri: ownUri(index),
    spellings: [],
    others: [poolUri(index * 2)],
  }));

  it('reads 50 cards mounted together, 50 own and 50 other links, in ONE `by_ids` request', async () => {
    answerByIds();

    await readFeed({ withOthers: true }, pairs);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(posts()).toHaveLength(1);
    expect(bodyOf(posts()[0]).uris).toHaveLength(2 * CARDS);
    expect(bodyOf(posts()[0]).viewer_id).toBe(VIEWER);
    // Every other link was answered, and its answer is the one every card of that link shares.
    for (const card of pairs) {
      expect(TagController.getCachedResourceTags({ uri: card.others[0], viewerId: VIEWER })).toEqual([tag('album')]);
    }
  });

  it('adds one request per viewport of cards mounted together, not one more for their other links', async () => {
    answerByIds();
    const viewports = [pairs.slice(0, 10), pairs.slice(10, 20), pairs.slice(20, 35), pairs.slice(35, 50)];

    for (const viewport of viewports) await readFeed({ withOthers: true }, viewport);

    expect(posts().map((call) => bodyOf(call).uris.length)).toEqual([20, 20, 30, 30]);
    expect(gets()).toHaveLength(0);
  });

  it('adds only the requests the new links need, in `by_ids` batches of at most 100, and no `by-uri` read', async () => {
    fetchSpy.mockImplementation(async (url, init) => {
      if (String(url) !== BY_IDS_URL) return new Response('', { status: 404 });
      const { uris } = JSON.parse(String(init?.body)) as { uris: string[] };
      return jsonResponse(uris.filter(isTagged).map(view));
    });

    await readFeed({ withOthers: false });
    const before = fetchSpy.mock.calls.length;
    expect(gets()).toHaveLength(0);

    await reloadModules();
    fetchSpy.mockClear();
    await readFeed({ withOthers: true });

    const otherUris = new Set(cards.flatMap((card) => card.others).filter((uri) => !uri.includes('musicbrainz')));
    const after = fetchSpy.mock.calls.length;
    expect(after).toBeLessThanOrEqual(before + Math.ceil(otherUris.size / RESOURCE_BY_IDS_MAX));
    // Not one request per card or per link: every read went in a `by_ids` batch.
    expect(gets()).toHaveLength(0);
    expect(posts()).toHaveLength(after);
    for (const call of posts()) {
      const body = bodyOf(call);
      expect(body.uris.length).toBeLessThanOrEqual(RESOURCE_BY_IDS_MAX);
      // The viewer and the tag limits stay what a card's own read asks.
      expect(body.viewer_id).toBe(VIEWER);
      expect(String(call[0])).toBe(BY_IDS_URL);
    }
    // Each other link asked once, the cards' own links not again.
    const asked = posts().flatMap((call) => bodyOf(call).uris);
    for (const uri of otherUris) expect(asked.filter((entry) => entry === uri)).toHaveLength(1);
    for (const card of cards) expect(asked.filter((entry) => entry === card.uri)).toHaveLength(1);
  });

  it('asks nothing for the other links on a Nexus without `by_ids`: no request per card or per link', async () => {
    fetchSpy.mockImplementation(async (url) =>
      String(url) === BY_IDS_URL ? new Response('', { status: 404 }) : new Response('', { status: 404 }),
    );

    await readFeed({ withOthers: false });
    const before = fetchSpy.mock.calls.length;

    await reloadModules();
    fetchSpy.mockClear();
    await readFeed({ withOthers: true });

    expect(fetchSpy.mock.calls.length).toBe(before);
    const askedByUri = gets().map(([url]) => new URL(String(url)).searchParams.get('uri'));
    expect(askedByUri.filter((uri) => uri?.includes('spotify'))).toEqual([]);
    // No answer is made up for them: a card of such a link still reads it.
    expect(TagController.getCachedResourceTags({ uri: poolUri(0), viewerId: VIEWER })).toBeUndefined();
  });
});
