import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNexusUrl } from '@/config/nexus';
import type { AppError as TAppError } from '@/libs/error/error';
import type { nexusQueryClient as TNexusQueryClient } from '@/services/nexus/nexus.query-client';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { mockNexusPostWire } from '@/test-utils/nexus';
import type { NexusResourceService as TNexusResourceService } from './resource';
import { resourceApi } from './resource.api';
import {
  RESOURCE_BY_IDS_BATCH_MS,
  RESOURCE_READ_TIMEOUT_MS,
  RESOURCE_TAG_UNCONFIRMED_MS,
  RESOURCE_TAGS_LIMIT,
} from './resource.constants';

// The viewer's unconfirmed tag writes are module state: every test reads a fresh service module.
let AppError: typeof TAppError;
let nexusQueryClient: typeof TNexusQueryClient;
let NexusResourceService: typeof TNexusResourceService;

beforeEach(async () => {
  vi.resetModules();
  ({ AppError } = await import('@/libs/error/error'));
  ({ nexusQueryClient } = await import('@/services/nexus/nexus.query-client'));
  ({ NexusResourceService } = await import('./resource'));
});

const URI = 'https://www.openstreetmap.org/node/240109189';
const VIEWER = 'hkdrfoddu3rmeucj1mazu4aeg11nxj7uaxybnmots5o9s5hd3t6y';
// The shape of a Nexus `GET /v1/resource/by-uri?uri=<URI>` answer (taggers shortened).
const BY_URI_RESPONSE = {
  resource: { id: '81cefcae5a6a468cfc27ff1c1b420fce', uri: URI, scheme: 'https', indexed_at: 1792421637616 },
  tags: [
    {
      label: 'berlin',
      taggers: ['7ehtbiryqz1pkncn7jgrxnzcrzxz8po79dwczgswfeuu3zbh1kwy'],
      taggers_count: 3,
      relationship: false,
      tag_uri: null,
    },
    { label: 'travel', taggers: [VIEWER], taggers_count: 2, relationship: false, tag_uri: null },
  ],
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('resourceApi', () => {
  it('builds the by-uri read with the link encoded', () => {
    expect(resourceApi.byUri({ uri: URI, viewer_id: VIEWER, limit_tags: 20 })).toBe(
      `${getNexusUrl()}/v1/resource/by-uri?uri=${encodeURIComponent(URI)}&viewer_id=${VIEWER}&limit_tags=20`,
    );
    expect(resourceApi.byUriEndpoint()).toBe(`${getNexusUrl()}/v1/resource/by-uri`);
  });
});

describe('NexusResourceService', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    // Link by link (`by-uri`), as on a Nexus without `by_ids`; the batch has its own tests below.
    NexusResourceService.clearBatch({ byIdsMissing: true });
    fetchSpy.mockReset();
  });

  afterEach(() => {
    nexusQueryClient.clear();
  });

  it('reads the link’s tags for the viewer', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(BY_URI_RESPONSE));

    const tags = await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER });

    expect(tags).toEqual(BY_URI_RESPONSE.tags);
    expect(fetchSpy).toHaveBeenCalledWith(
      resourceApi.byUri({ uri: URI, viewer_id: VIEWER, limit_tags: RESOURCE_TAGS_LIMIT }),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('marks the viewer’s tags from `tag_uri` on a /v1 answer, which carries no `relationship`', async () => {
    const v1Answer = {
      ...BY_URI_RESPONSE,
      tags: [
        {
          label: 'berlin',
          taggers: ['7ehtbiryqz1pkncn7jgrxnzcrzxz8po79dwczgswfeuu3zbh1kwy'],
          taggers_count: 3,
          tag_uri: null,
        },
        { label: 'travel', taggers: [VIEWER], taggers_count: 2, tag_uri: `pubky://${VIEWER}/pub/social/v1/tags/T1` },
      ],
    };
    fetchSpy.mockResolvedValue(jsonResponse(v1Answer));

    const tags = await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER });

    expect(tags.map((tag) => [tag.label, tag.relationship])).toEqual([
      ['berlin', false],
      ['travel', true],
    ]);
  });

  it('reads without a viewer when signed out', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(BY_URI_RESPONSE));

    await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: null });

    expect(String(fetchSpy.mock.calls[0][0])).not.toContain('viewer_id');
  });

  it('shares one request between readers of the same link and viewer', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(BY_URI_RESPONSE));

    await Promise.all([
      NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER }),
      NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER }),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('answers a 404 (nobody tagged the link yet) with no tags, without an error', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 404 }));

    await expect(NexusResourceService.fetchTagsByUri({ uri: URI })).resolves.toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fails with an AppError that keeps the link out of its endpoint', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 400 }));

    const error = await NexusResourceService.fetchTagsByUri({ uri: URI }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect(JSON.stringify((error as TAppError).context)).not.toContain('openstreetmap');
  });

  it('applies the viewer’s write to the cached answer', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(BY_URI_RESPONSE));
    await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER });

    NexusResourceService.applyViewerTag({ uri: URI, label: 'city', viewerId: VIEWER, tagUri: 'pubky://x' }, true);
    const tags = await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(tags.map((tag: NexusTag) => tag.label)).toEqual(['berlin', 'travel', 'city']);
    expect(tags[2]).toMatchObject({ relationship: true, taggers_count: 1, tag_uri: 'pubky://x' });
  });

  it('tells every subscriber of the link the answer and each write applied to it', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(BY_URI_RESPONSE));
    const first = vi.fn();
    const second = vi.fn();
    const otherViewer = vi.fn();
    const unsubscribeFirst = NexusResourceService.subscribeTags({ uri: URI, viewerId: VIEWER }, first);
    const unsubscribeSecond = NexusResourceService.subscribeTags({ uri: URI, viewerId: VIEWER }, second);
    const unsubscribeOther = NexusResourceService.subscribeTags({ uri: URI, viewerId: null }, otherViewer);

    await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER });
    await vi.waitFor(() => expect(first).toHaveBeenLastCalledWith(BY_URI_RESPONSE.tags));
    expect(second).toHaveBeenLastCalledWith(BY_URI_RESPONSE.tags);

    unsubscribeSecond();
    NexusResourceService.applyViewerTag({ uri: URI, label: 'city', viewerId: VIEWER, tagUri: 'pubky://x' }, true);
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(2));
    expect(first.mock.lastCall?.[0].map((tag: NexusTag) => tag.label)).toEqual(['berlin', 'travel', 'city']);
    expect(second).toHaveBeenCalledTimes(1);
    expect(otherViewer).not.toHaveBeenCalled();

    unsubscribeFirst();
    unsubscribeOther();
  });

  it('never fetches for a subscriber', async () => {
    const unsubscribe = NexusResourceService.subscribeTags({ uri: URI, viewerId: VIEWER }, vi.fn());

    await Promise.resolve();

    expect(fetchSpy).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('keeps the viewer’s write over a fresh answer that does not show it yet, for every reader', async () => {
    fetchSpy.mockImplementation(async () => jsonResponse(BY_URI_RESPONSE));
    await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER });
    const otherCard = vi.fn();
    const unsubscribe = NexusResourceService.subscribeTags({ uri: URI, viewerId: VIEWER }, otherCard);

    NexusResourceService.applyViewerTag({ uri: URI, label: 'city', viewerId: VIEWER, tagUri: 'pubky://x' }, true);
    const tags = await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER, fresh: true });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(tags.map((tag: NexusTag) => tag.label)).toEqual(['berlin', 'travel', 'city']);
    await vi.waitFor(() =>
      expect(otherCard.mock.lastCall?.[0].map((tag: NexusTag) => tag.label)).toEqual(['berlin', 'travel', 'city']),
    );
    expect(NexusResourceService.hasUnconfirmedTags({ uri: URI, viewerId: VIEWER })).toBe(true);
    unsubscribe();
  });

  it('forgets the write once Nexus’ answer shows it', async () => {
    const indexed = {
      ...BY_URI_RESPONSE,
      tags: [
        ...BY_URI_RESPONSE.tags,
        { label: 'city', taggers: [VIEWER], taggers_count: 1, relationship: true, tag_uri: 'pubky://x' },
      ],
    };
    fetchSpy.mockImplementation(async () => jsonResponse(indexed));
    NexusResourceService.applyViewerTag({ uri: URI, label: 'city', viewerId: VIEWER, tagUri: 'pubky://x' }, true);

    await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER, fresh: true });

    expect(NexusResourceService.hasUnconfirmedTags({ uri: URI, viewerId: VIEWER })).toBe(false);
  });

  it('drops a write Nexus never showed once it is as old as the last re-read, on any read', async () => {
    fetchSpy.mockImplementation(async () => jsonResponse(BY_URI_RESPONSE));
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      NexusResourceService.applyViewerTag({ uri: URI, label: 'city', viewerId: VIEWER }, true);
      clock.mockReturnValue(now + 10_000);
      NexusResourceService.applyViewerTag({ uri: URI, label: 'food', viewerId: VIEWER }, true);

      clock.mockReturnValue(now + RESOURCE_TAG_UNCONFIRMED_MS);
      const tags = await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER, fresh: true });

      // The older write is dropped; the newer one (written by another card 10 s later) stays.
      expect(tags.map((tag: NexusTag) => tag.label)).toEqual(['berlin', 'travel', 'food']);
      expect(NexusResourceService.hasUnconfirmedTags({ uri: URI, viewerId: VIEWER })).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });

  it('decides by age also for a read that joined one in flight', async () => {
    let answer: (response: Response) => void = () => {};
    fetchSpy.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      NexusResourceService.applyViewerTag({ uri: URI, label: 'city', viewerId: VIEWER }, true);
      const first = NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER, fresh: true });
      const joined = NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER, fresh: true });
      clock.mockReturnValue(now + RESOURCE_TAG_UNCONFIRMED_MS);
      answer(jsonResponse(BY_URI_RESPONSE));

      expect(await joined).toEqual(BY_URI_RESPONSE.tags);
      expect(await first).toEqual(BY_URI_RESPONSE.tags);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(NexusResourceService.hasUnconfirmedTags({ uri: URI, viewerId: VIEWER })).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });

  it('keeps an add missing from a full answer when it is dropped (it may be cut off)', async () => {
    const full = Array.from({ length: RESOURCE_TAGS_LIMIT }, (_, index) => ({
      label: `tag${index}`,
      taggers: ['someone'],
      taggers_count: 1,
      relationship: false,
      tag_uri: null,
    }));
    fetchSpy.mockImplementation(async () => jsonResponse({ ...BY_URI_RESPONSE, tags: full }));
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      NexusResourceService.applyViewerTag({ uri: URI, label: 'city', viewerId: VIEWER }, true);
      clock.mockReturnValue(now + RESOURCE_TAG_UNCONFIRMED_MS);

      const tags = await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER, fresh: true });

      expect(tags.at(-1)).toMatchObject({ label: 'city', relationship: true });
      expect(NexusResourceService.hasUnconfirmedTags({ uri: URI, viewerId: VIEWER })).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });

  it('keeps no write for another viewer', async () => {
    fetchSpy.mockImplementation(async () => jsonResponse(BY_URI_RESPONSE));
    NexusResourceService.applyViewerTag({ uri: URI, label: 'city', viewerId: VIEWER }, true);

    expect(await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: null })).toEqual(BY_URI_RESPONSE.tags);
  });

  it('applies nothing when the link was never read', () => {
    NexusResourceService.applyViewerTag({ uri: URI, label: 'city', viewerId: VIEWER }, true);

    expect(nexusQueryClient.getQueryData(['nexus', 'resource', 'by-uri', URI, VIEWER])).toBeUndefined();
  });
});

describe('NexusResourceService counts and replies (our Nexus fork)', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const WITH_COUNTS = { ...BY_URI_RESPONSE, replies_count: 3, embeds_count: 1, collections_count: 2 };
  const RESOURCE_ID = BY_URI_RESPONSE.resource.id;

  beforeEach(() => {
    nexusQueryClient.clear();
    // Link by link (`by-uri`), as on a Nexus without `by_ids`.
    NexusResourceService.clearBatch({ byIdsMissing: true });
    fetchSpy.mockReset();
  });

  afterEach(() => {
    nexusQueryClient.clear();
  });

  it('reads the link’s counts and id', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(WITH_COUNTS));

    await expect(NexusResourceService.fetchCounts({ uri: URI })).resolves.toEqual({
      resourceId: RESOURCE_ID,
      replies: 3,
      embeds: 1,
      collections: 2,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      resourceApi.byUri({ uri: URI, limit_tags: 1, limit_taggers: 1 }),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('leaves out the counts a Nexus does not serve', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(BY_URI_RESPONSE));

    await expect(NexusResourceService.fetchCounts({ uri: URI })).resolves.toEqual({
      resourceId: RESOURCE_ID,
      replies: undefined,
      embeds: undefined,
      collections: undefined,
    });
  });

  it('reads no counts for a link Nexus does not know (404)', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(NexusResourceService.fetchCounts({ uri: URI })).resolves.toBeNull();
  });

  it('takes the counts from a card’s tag read, without a request of their own', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(WITH_COUNTS));
    const listener = vi.fn();
    const unsubscribe = NexusResourceService.subscribeCounts(URI, listener);

    await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER });

    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(expect.objectContaining({ replies: 3 })));
    expect(NexusResourceService.getCachedCounts(URI)).toEqual(expect.objectContaining({ resourceId: RESOURCE_ID }));
    await NexusResourceService.fetchCounts({ uri: URI });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('gives the tags a reader already brought in, per viewer, without a request', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(WITH_COUNTS));
    expect(NexusResourceService.getCachedTags({ uri: URI, viewerId: VIEWER })).toBeUndefined();

    const tags = await NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER });

    expect(NexusResourceService.getCachedTags({ uri: URI, viewerId: VIEWER })).toBe(tags);
    expect(NexusResourceService.getCachedTags({ uri: URI })).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('waits for a tag read of the link in flight instead of asking again', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(WITH_COUNTS));

    const tags = NexusResourceService.fetchTagsByUri({ uri: URI, viewerId: VIEWER });
    const counts = NexusResourceService.fetchCounts({ uri: URI });

    await expect(counts).resolves.toEqual(expect.objectContaining({ replies: 3, collections: 2 }));
    await tags;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('folds the /v1 post kinds of the replies to the local names', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse([mockNexusPostWire({ id: '0035ZWRE0B45E', kind: 'article' }), mockNexusPostWire({ kind: 'note' })]),
    );

    const replies = await NexusResourceService.fetchReplies({ resourceId: RESOURCE_ID, viewerId: VIEWER });

    expect(replies.map((reply) => reply.details.kind)).toEqual(['long', 'short']);
  });

  it('reads the replies by the resource’s id', async () => {
    fetchSpy.mockResolvedValue(jsonResponse([]));

    await expect(
      NexusResourceService.fetchReplies({ resourceId: RESOURCE_ID, viewerId: VIEWER, skip: 3, limit: 20 }),
    ).resolves.toEqual([]);
    expect(fetchSpy.mock.calls[0][0]).toBe(
      `${getNexusUrl()}/v1/resource/${RESOURCE_ID}/replies?viewer_id=${VIEWER}&skip=3&limit=20`,
    );
  });
});

describe('NexusResourceService batched tag reads (POST /v1/stream/resources/by_ids)', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const OSM = 'https://www.openstreetmap.org/node/270803095';
  const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const UNKNOWN = 'https://nobody-tagged.example/page';
  const tag = (label: string, taggers: string[], taggersCount = taggers.length): NexusTag => ({
    label,
    taggers,
    taggers_count: taggersCount,
    relationship: false,
    tag_uri: null,
  });
  const view = (uri: string, tags: NexusTag[], id = 'c10fedfa853bcdbdd4b18d8257250518') => ({
    details: { id, uri, scheme: 'https', indexed_at: 1792548723375 },
    tags,
    taggers_count: tags.length,
    replies_count: 1,
    embeds_count: 0,
    collections_count: 2,
  });
  // The shape of a `POST /v1/stream/resources/by_ids` answer.
  const OSM_VIEW = view(OSM, [tag('coffee', ['a', 'b', 'c']), tag('zurich', ['a'])]);
  const YOUTUBE_VIEW = view(YOUTUBE, [tag('video', ['k'])], '0f3820de1c3532e8805674cc996978f9');
  const BY_IDS_URL = resourceApi.byIds({ uris: [], limit_tags: RESOURCE_TAGS_LIMIT }).url;
  const byIdsCalls = () => fetchSpy.mock.calls.filter(([url]) => String(url) === BY_IDS_URL);
  const byUriCalls = () => fetchSpy.mock.calls.filter(([url]) => String(url).includes('/v1/resource/by-uri'));
  const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));
  const read = (uri: string, viewerId: string | null = VIEWER) =>
    NexusResourceService.fetchTagsByUri({ uri, viewerId });

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  afterEach(() => {
    nexusQueryClient.clear();
  });

  it('reads every link asked at the same moment in one request, for the viewer, each answer with its link', async () => {
    fetchSpy.mockResolvedValue(jsonResponse([OSM_VIEW, YOUTUBE_VIEW]));

    const [osm, unknown, youtube] = await Promise.all([read(OSM), read(UNKNOWN), read(YOUTUBE)]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(byIdsCalls()).toHaveLength(1);
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(bodyOf(fetchSpy.mock.calls[0])).toEqual({ uris: [OSM, UNKNOWN, YOUTUBE], viewer_id: VIEWER });
    expect(osm).toEqual(OSM_VIEW.tags);
    expect(youtube).toEqual(YOUTUBE_VIEW.tags);
    // Skipped by Nexus: nobody tagged it, as `by-uri`'s 404.
    expect(unknown).toEqual([]);
  });

  it('marks the viewer’s tags from `tag_uri` in a /v1 view, which carries no `relationship`', async () => {
    const v1View = {
      ...OSM_VIEW,
      tags: [
        { label: 'coffee', taggers: ['a', 'b', 'c'], taggers_count: 3, tag_uri: null },
        { label: 'zurich', taggers: [VIEWER], taggers_count: 1, tag_uri: `pubky://${VIEWER}/pub/social/v1/tags/T1` },
      ],
    };
    fetchSpy.mockResolvedValue(jsonResponse([v1View]));

    const tags = await read(OSM);

    expect(byIdsCalls()).toHaveLength(1);
    expect(tags.map((tag) => [tag.label, tag.relationship])).toEqual([
      ['coffee', false],
      ['zurich', true],
    ]);
  });

  it('fills each link’s shared answer and counts, so a later card of the link asks nothing', async () => {
    fetchSpy.mockResolvedValue(jsonResponse([OSM_VIEW]));

    await Promise.all([read(OSM), read(UNKNOWN)]);
    await read(OSM);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(NexusResourceService.getCachedCounts(OSM)).toEqual({
      resourceId: OSM_VIEW.details.id,
      replies: 1,
      embeds: 0,
      collections: 2,
    });
    expect(NexusResourceService.getCachedCounts(UNKNOWN)).toBeNull();
  });

  it('asks signed out without a viewer, and keeps viewers apart', async () => {
    fetchSpy.mockImplementation(async () => jsonResponse([OSM_VIEW]));

    await Promise.all([read(OSM, null), read(OSM, VIEWER)]);

    expect(byIdsCalls().map(bodyOf)).toEqual([{ uris: [OSM] }, { uris: [OSM], viewer_id: VIEWER }]);
  });

  it('matches a link Nexus returns normalized (host case, fragment)', async () => {
    const written = 'https://WWW.OpenStreetMap.org/node/270803095#map=19';
    fetchSpy.mockResolvedValue(jsonResponse([OSM_VIEW]));

    expect(await read(written)).toEqual(OSM_VIEW.tags);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('asks `by_ids` for the limits `by-uri` is asked for, and takes its views as they are', async () => {
    const manyTags = view(
      YOUTUBE,
      ['a', 'b', 'c', 'd', 'e', 'f'].map((label) => tag(label, ['k', 'l', 'm', 'n', 'o'], 9)),
    );
    fetchSpy.mockResolvedValue(jsonResponse([OSM_VIEW, manyTags]));

    expect(await Promise.all([read(OSM), read(YOUTUBE)])).toEqual([OSM_VIEW.tags, manyTags.tags]);

    expect(new URL(BY_IDS_URL).searchParams.get('limit_tags')).toBe(String(RESOURCE_TAGS_LIMIT));
    expect(byIdsCalls()).toHaveLength(1);
    expect(byUriCalls()).toHaveLength(0);
  });

  it('reads link by link on a Nexus without `by_ids` (404), and does not ask it again', async () => {
    fetchSpy.mockImplementation(async (url) =>
      String(url) === BY_IDS_URL ? new Response('Not Found', { status: 404 }) : jsonResponse(BY_URI_RESPONSE),
    );

    const [first, second] = await Promise.all([read(OSM), read(YOUTUBE)]);
    await read(UNKNOWN);

    expect(first).toEqual(BY_URI_RESPONSE.tags);
    expect(second).toEqual(BY_URI_RESPONSE.tags);
    expect(byIdsCalls()).toHaveLength(1);
    expect(byUriCalls()).toHaveLength(3);
  });

  it('tells whether Nexus serves `by_ids` once a batch was answered', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([OSM_VIEW]));
    expect(NexusResourceService.isByIdsServed()).toBe(false);

    await read(OSM);

    expect(NexusResourceService.isByIdsServed()).toBe(true);
  });

  it('reads link by link when Nexus refuses the batch (400), and keeps batching later reads', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('bad uri', { status: 400 }))
      .mockResolvedValueOnce(jsonResponse(BY_URI_RESPONSE))
      .mockResolvedValueOnce(jsonResponse([OSM_VIEW]));

    expect(await read(YOUTUBE)).toEqual(BY_URI_RESPONSE.tags);
    expect(await read(OSM)).toEqual(OSM_VIEW.tags);
    expect(byIdsCalls()).toHaveLength(2);
    expect(byUriCalls()).toHaveLength(1);
  });

  it('leaves the links to `by-uri` when a view matches none of them', async () => {
    fetchSpy.mockImplementation(async (url) =>
      String(url) === BY_IDS_URL
        ? jsonResponse([view('https://elsewhere.example/', [tag('x', ['a'])])])
        : jsonResponse(BY_URI_RESPONSE),
    );

    expect(await read(OSM)).toEqual(BY_URI_RESPONSE.tags);
    expect(byUriCalls()).toHaveLength(1);
  });

  it('reads link by link on a 405 too', async () => {
    fetchSpy.mockImplementation(async (url) =>
      String(url) === BY_IDS_URL ? new Response('', { status: 405 }) : jsonResponse(BY_URI_RESPONSE),
    );

    await read(OSM);
    await read(YOUTUBE);

    expect(byIdsCalls()).toHaveLength(1);
    expect(byUriCalls()).toHaveLength(2);
  });

  it('reads a link Nexus does not take (no URI, longer than 2048 bytes) alone, the others in the batch', async () => {
    const long = `https://e.com/${'a'.repeat(2048)}`;
    fetchSpy.mockImplementation(async (url) =>
      String(url) === BY_IDS_URL ? jsonResponse([OSM_VIEW]) : jsonResponse(BY_URI_RESPONSE),
    );

    await Promise.all([read('not a uri'), read(long), read(OSM)]);

    expect(byIdsCalls().map(bodyOf)).toEqual([{ uris: [OSM], viewer_id: VIEWER }]);
    expect(byUriCalls()).toHaveLength(2);
  });

  it('answers two spellings of one link from the views Nexus returns for each', async () => {
    const other = 'https://www.openstreetmap.org/node/270803095#map';
    fetchSpy.mockResolvedValue(jsonResponse([OSM_VIEW, OSM_VIEW]));

    expect(await Promise.all([read(OSM), read(other)])).toEqual([OSM_VIEW.tags, OSM_VIEW.tags]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('batches a fresh re-read after a write too', async () => {
    fetchSpy.mockImplementation(async () => jsonResponse([OSM_VIEW]));

    await read(OSM);
    await NexusResourceService.fetchTagsByUri({ uri: OSM, viewerId: VIEWER, fresh: true });

    expect(byIdsCalls()).toHaveLength(2);
    expect(byUriCalls()).toHaveLength(0);
  });

  it('reads by `by-uri` when the batch answer is not a list of views', async () => {
    fetchSpy.mockImplementation(async (url) =>
      String(url) === BY_IDS_URL ? jsonResponse({}) : jsonResponse(BY_URI_RESPONSE),
    );
    expect(await read(OSM)).toEqual(BY_URI_RESPONSE.tags);

    nexusQueryClient.clear();
    fetchSpy.mockImplementation(async (url) =>
      String(url) === BY_IDS_URL ? jsonResponse([{ details: null }, OSM_VIEW]) : jsonResponse(BY_URI_RESPONSE),
    );
    expect(await Promise.all([read(YOUTUBE), read(OSM)])).toEqual([BY_URI_RESPONSE.tags, OSM_VIEW.tags]);
    expect(byUriCalls()).toHaveLength(2);
  });

  it('reads at most six links by `by-uri` at a time', async () => {
    NexusResourceService.clearBatch({ byIdsMissing: true });
    const answers: Array<() => void> = [];
    fetchSpy.mockImplementation(
      () => new Promise<Response>((resolve) => answers.push(() => resolve(jsonResponse(BY_URI_RESPONSE)))),
    );
    const reads = Promise.all(Array.from({ length: 8 }, (_, index) => read(`https://e.com/${index}`)));

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(6));
    answers.splice(0, 2).forEach((answer) => answer());
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(8));
    answers.splice(0).forEach((answer) => answer());
    expect(await reads).toHaveLength(8);
  });

  it('collects links asked a few milliseconds apart (a feed mounting its cards), at most 100 ms', async () => {
    vi.useFakeTimers();
    try {
      fetchSpy.mockImplementation(async () => jsonResponse([]));
      const reads: Promise<NexusTag[]>[] = [];
      for (let index = 0; index < 30; index++) {
        reads.push(read(`https://e.com/${index}`));
        await vi.advanceTimersByTimeAsync(5);
      }
      await vi.advanceTimersByTimeAsync(RESOURCE_BY_IDS_BATCH_MS);
      await Promise.all(reads);

      // 30 links 5 ms apart: sent 100 ms after the first (20 links), the rest once no link followed.
      expect(byIdsCalls().map((call) => bodyOf(call).uris.length)).toEqual([20, 10]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends one `by_ids` request while it is unknown whether Nexus has it, then the waiting batches', async () => {
    let answerProbe: (response: Response) => void = () => {};
    fetchSpy.mockImplementation((url) =>
      String(url) === BY_IDS_URL && byIdsCalls().length === 1
        ? new Promise<Response>((resolve) => (answerProbe = resolve))
        : Promise.resolve(jsonResponse(BY_URI_RESPONSE)),
    );
    const first = read(OSM);
    await vi.waitFor(() => expect(byIdsCalls()).toHaveLength(1));
    const second = read(YOUTUBE);
    await new Promise((resolve) => setTimeout(resolve, RESOURCE_BY_IDS_BATCH_MS * 3));

    expect(byIdsCalls()).toHaveLength(1);
    answerProbe(new Response('Not Found', { status: 404 }));
    await Promise.all([first, second]);
    expect(byIdsCalls()).toHaveLength(1);
    expect(byUriCalls()).toHaveLength(2);
  });

  it('sends the waiting batches once the probe was answered, each by `by_ids`', async () => {
    let answerProbe: (response: Response) => void = () => {};
    fetchSpy.mockImplementation((url) =>
      String(url) === BY_IDS_URL && byIdsCalls().length === 1
        ? new Promise<Response>((resolve) => (answerProbe = resolve))
        : Promise.resolve(jsonResponse([YOUTUBE_VIEW])),
    );
    const first = read(OSM);
    await vi.waitFor(() => expect(byIdsCalls()).toHaveLength(1));
    const second = read(YOUTUBE);
    await new Promise((resolve) => setTimeout(resolve, RESOURCE_BY_IDS_BATCH_MS * 3));
    answerProbe(jsonResponse([OSM_VIEW]));

    expect(await Promise.all([first, second])).toEqual([OSM_VIEW.tags, YOUTUBE_VIEW.tags]);
    expect(byIdsCalls()).toHaveLength(2);
    expect(byUriCalls()).toHaveLength(0);
  });

  it('reads by `by-uri` on a probe answered with a 500, and leaves `by_ids` out for the waiting batches', async () => {
    let answerProbe: (response: Response) => void = () => {};
    fetchSpy.mockImplementation((url) =>
      String(url) === BY_IDS_URL
        ? new Promise<Response>((resolve) => (answerProbe = resolve))
        : Promise.resolve(jsonResponse(BY_URI_RESPONSE)),
    );
    const first = read(OSM);
    await vi.waitFor(() => expect(byIdsCalls()).toHaveLength(1));
    const second = read(YOUTUBE);
    await new Promise((resolve) => setTimeout(resolve, RESOURCE_BY_IDS_BATCH_MS * 3));
    answerProbe(new Response('boom', { status: 500 }));

    expect(await Promise.all([first, second])).toEqual([BY_URI_RESPONSE.tags, BY_URI_RESPONSE.tags]);
    await read(UNKNOWN);
    expect(byIdsCalls()).toHaveLength(1);
    expect(byUriCalls()).toHaveLength(3);
  });

  it('reads by `by-uri` when the probe fails to connect, and does not ask `by_ids` again', async () => {
    fetchSpy.mockImplementation(async (url) => {
      if (String(url) === BY_IDS_URL) throw new TypeError('Failed to fetch');
      return jsonResponse(BY_URI_RESPONSE);
    });

    expect(await Promise.all([read(OSM), read(YOUTUBE)])).toEqual([BY_URI_RESPONSE.tags, BY_URI_RESPONSE.tags]);
    await read(UNKNOWN);

    expect(byIdsCalls()).toHaveLength(1);
    expect(byUriCalls()).toHaveLength(3);
  });

  it('reads a failed batch’s links by `by-uri` once Nexus served `by_ids`, and keeps batching', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse([OSM_VIEW]))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(BY_URI_RESPONSE))
      .mockResolvedValueOnce(jsonResponse([]));

    expect(await read(OSM)).toEqual(OSM_VIEW.tags);
    expect(await read(YOUTUBE)).toEqual(BY_URI_RESPONSE.tags);
    expect(await read(UNKNOWN)).toEqual([]);
    expect(byIdsCalls()).toHaveLength(3);
    expect(byUriCalls()).toHaveLength(1);
  });

  it('gives up on a probe that never answers, so the batches waiting for it are read by `by-uri`', async () => {
    vi.useFakeTimers();
    // AbortSignal.timeout runs on Node's own timers: one on the faked ones instead.
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
    fetchSpy.mockImplementation((url, init) =>
      String(url) === BY_IDS_URL
        ? new Promise<Response>((_, reject) =>
            init?.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError'))),
          )
        : Promise.resolve(jsonResponse(BY_URI_RESPONSE)),
    );
    try {
      const first = read(OSM);
      await vi.advanceTimersByTimeAsync(RESOURCE_BY_IDS_BATCH_MS * 2);
      const second = read(YOUTUBE);
      await vi.advanceTimersByTimeAsync(RESOURCE_READ_TIMEOUT_MS);

      expect(await Promise.all([first, second])).toEqual([BY_URI_RESPONSE.tags, BY_URI_RESPONSE.tags]);
      expect(byIdsCalls()).toHaveLength(1);
    } finally {
      timeout.mockRestore();
      vi.useRealTimers();
    }
  });

  it('reads by `by-uri` a view whose tags are malformed', async () => {
    fetchSpy.mockImplementation(async (url) =>
      String(url) === BY_IDS_URL
        ? jsonResponse([{ ...OSM_VIEW, tags: [{ label: 'x' }] }])
        : jsonResponse(BY_URI_RESPONSE),
    );

    expect(await read(OSM)).toEqual(BY_URI_RESPONSE.tags);
  });

  it('reads alone a spelling of a link Nexus answered once for two spellings', async () => {
    const other = 'https://www.openstreetmap.org/node/270803095#map';
    fetchSpy.mockImplementation(async (url) =>
      String(url) === BY_IDS_URL ? jsonResponse([OSM_VIEW]) : jsonResponse(BY_URI_RESPONSE),
    );

    expect(await Promise.all([read(OSM), read(other)])).toEqual([OSM_VIEW.tags, BY_URI_RESPONSE.tags]);
  });

  describe('a read only in the batch (another link of a card in a feed, `fetchBatchedTags`)', () => {
    const inBatch = (uri: string) => NexusResourceService.fetchBatchedTags({ uri, viewerId: VIEWER });

    it('goes in the same `by_ids` request as the links read with it, and fills the shared answer', async () => {
      fetchSpy.mockResolvedValue(jsonResponse([OSM_VIEW, YOUTUBE_VIEW]));

      const [osm, youtube, unknown] = await Promise.all([read(OSM), inBatch(YOUTUBE), inBatch(UNKNOWN)]);

      expect(byIdsCalls().map(bodyOf)).toEqual([{ uris: [OSM, YOUTUBE, UNKNOWN], viewer_id: VIEWER }]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect([osm, youtube, unknown]).toEqual([OSM_VIEW.tags, YOUTUBE_VIEW.tags, []]);
      // Every reader of the link shares it: a card of that link asks nothing.
      expect(NexusResourceService.getCachedTags({ uri: YOUTUBE, viewerId: VIEWER })).toEqual(YOUTUBE_VIEW.tags);
      expect(NexusResourceService.getCachedCounts(YOUTUBE)).toMatchObject({ collections: 2 });
      await read(YOUTUBE);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('asks no `by-uri` on a Nexus without `by_ids`, and caches no answer it did not get', async () => {
      fetchSpy.mockImplementation(async (url) =>
        String(url) === BY_IDS_URL ? new Response('', { status: 404 }) : jsonResponse(BY_URI_RESPONSE),
      );

      await expect(inBatch(YOUTUBE)).resolves.toBeUndefined();
      expect(byUriCalls()).toHaveLength(0);
      expect(NexusResourceService.getCachedTags({ uri: YOUTUBE, viewerId: VIEWER })).toBeUndefined();
      // Once known, nothing is asked at all.
      await expect(inBatch(OSM)).resolves.toBeUndefined();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // A card of the link still reads it.
      expect(await read(YOUTUBE)).toEqual(BY_URI_RESPONSE.tags);
      expect(byUriCalls()).toHaveLength(1);
    });

    it('leaves a link the batch could not answer unread, with no `by-uri` and nothing cached', async () => {
      // A view naming no asked link: the unmatched links are not known to be untagged.
      fetchSpy.mockResolvedValue(jsonResponse([view('https://elsewhere.example/x', [tag('x', ['a'])])]));

      await expect(inBatch(YOUTUBE)).resolves.toBeUndefined();
      expect(byUriCalls()).toHaveLength(0);
      expect(NexusResourceService.getCachedTags({ uri: YOUTUBE, viewerId: VIEWER })).toBeUndefined();
    });

    it.each([
      ['answered with a 500', () => new Response('boom', { status: 500 })],
      [
        'that fails to connect',
        () => {
          throw new TypeError('Failed to fetch');
        },
      ],
    ] as const)(
      'leaves a link unread after a `by_ids` request %s: no `by-uri`, nothing cached, a card of it still reads it',
      async (_, fail) => {
        fetchSpy.mockImplementation(async (url) =>
          String(url) === BY_IDS_URL ? fail() : jsonResponse(BY_URI_RESPONSE),
        );

        await expect(inBatch(YOUTUBE)).resolves.toBeUndefined();
        expect(byIdsCalls()).toHaveLength(1);
        expect(byUriCalls()).toHaveLength(0);
        expect(NexusResourceService.getCachedTags({ uri: YOUTUBE, viewerId: VIEWER })).toBeUndefined();
        // No made-up empty answer: the card of the link reads it (by `by-uri`, `by_ids` being left out now).
        expect(await read(YOUTUBE)).toEqual(BY_URI_RESPONSE.tags);
        expect(byUriCalls()).toHaveLength(1);
        expect(NexusResourceService.getCachedTags({ uri: YOUTUBE, viewerId: VIEWER })).toEqual(BY_URI_RESPONSE.tags);
      },
    );

    it('leaves a link unread when a batch fails once Nexus served `by_ids`, and a card of it still reads it', async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse([OSM_VIEW]))
        .mockResolvedValueOnce(new Response('boom', { status: 500 }))
        .mockResolvedValue(jsonResponse([YOUTUBE_VIEW]));
      await read(OSM);

      await expect(inBatch(YOUTUBE)).resolves.toBeUndefined();
      expect(byUriCalls()).toHaveLength(0);
      expect(NexusResourceService.getCachedTags({ uri: YOUTUBE, viewerId: VIEWER })).toBeUndefined();
      // `by_ids` stays in use: the card's own read asks it again.
      expect(await read(YOUTUBE)).toEqual(YOUTUBE_VIEW.tags);
      expect(byIdsCalls()).toHaveLength(3);
      expect(byUriCalls()).toHaveLength(0);
    });

    it('shares a read of the link already made or under way, asking nothing more', async () => {
      let answer: (response: Response) => void = () => {};
      fetchSpy.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));

      const first = inBatch(YOUTUBE);
      await vi.waitFor(() => expect(byIdsCalls()).toHaveLength(1));
      // Another card's read of the same link while the first is under way, in a later batch window.
      const second = inBatch(YOUTUBE);
      const own = read(YOUTUBE);
      answer(jsonResponse([YOUTUBE_VIEW]));

      expect(await Promise.all([first, second, own])).toEqual([
        YOUTUBE_VIEW.tags,
        YOUTUBE_VIEW.tags,
        YOUTUBE_VIEW.tags,
      ]);
      await expect(inBatch(YOUTUBE)).resolves.toEqual(YOUTUBE_VIEW.tags);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('asks 100 links per request', async () => {
    fetchSpy.mockImplementation(async () => jsonResponse([]));
    const uris = Array.from({ length: 150 }, (_, index) => `https://e.com/${index}`);

    await Promise.all(uris.map((uri) => read(uri)));

    expect(byIdsCalls().map((call) => bodyOf(call).uris.length)).toEqual([100, 50]);
    expect(byUriCalls()).toHaveLength(0);
  });

  it('fails a read only when its `by-uri` fallback fails too', async () => {
    fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }));
    const failing = nexusQueryClient.getDefaultOptions();
    nexusQueryClient.setDefaultOptions({ queries: { ...failing.queries, retry: false } });

    try {
      const results = await Promise.allSettled([read(OSM), read(YOUTUBE)]);
      expect(results.map((result) => result.status === 'rejected' && result.reason)).toEqual([
        expect.any(AppError),
        expect.any(AppError),
      ]);
      expect(byIdsCalls()).toHaveLength(1);
      expect(byUriCalls()).toHaveLength(2);
    } finally {
      nexusQueryClient.setDefaultOptions(failing);
    }
  });
});

describe('NexusResourceService resource stream (GET /v0/stream/resources)', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const VIEW = { details: BY_URI_RESPONSE.resource, tags: BY_URI_RESPONSE.tags, taggers_count: 2 };

  beforeEach(() => {
    nexusQueryClient.clear();
    fetchSpy.mockReset();
  });

  afterEach(() => {
    nexusQueryClient.clear();
  });

  it('reads a page by tags, the latest tagged first, with only the members the route applies', async () => {
    fetchSpy.mockResolvedValue(jsonResponse([VIEW]));

    await expect(
      NexusResourceService.fetchStream({ tags: ['music', 'video'], viewerId: VIEWER, skip: 10, limit: 10 }),
    ).resolves.toEqual([VIEW]);

    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.pathname).toBe('/v0/stream/resources');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tags: 'music,video',
      sorting: 'timeline',
      skip: '10',
      limit: '10',
      viewer_id: VIEWER,
    });
    // Nexus ignores these on the resource stream (a `q` alone answers every resource): never sent
    for (const ignored of ['reach', 'q', 'kind', 'domain_tags', 'source', 'user_id', 'observer_id']) {
      expect(url.searchParams.has(ignored)).toBe(false);
    }
  });

  it('reads every resource without tags, and no viewer signed out', async () => {
    fetchSpy.mockResolvedValue(jsonResponse([]));

    await expect(NexusResourceService.fetchStream({ tags: [], viewerId: null, skip: 0, limit: 10 })).resolves.toEqual(
      [],
    );
    expect(fetchSpy.mock.calls[0][0]).toBe(`${getNexusUrl()}/v0/stream/resources?sorting=timeline&skip=0&limit=10`);
  });

  it('reads each page again rather than from the cache', async () => {
    fetchSpy.mockImplementation(async () => jsonResponse([VIEW]));

    await NexusResourceService.fetchStream({ tags: ['music'], skip: 0, limit: 10 });
    await NexusResourceService.fetchStream({ tags: ['music'], skip: 0, limit: 10 });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('refuses more tags than the route takes instead of dropping some', async () => {
    await expect(
      NexusResourceService.fetchStream({ tags: ['a', 'b', 'c', 'd', 'e', 'f'], skip: 0, limit: 10 }),
    ).rejects.toBeInstanceOf(AppError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails as an AppError when Nexus refuses the query', async () => {
    fetchSpy.mockResolvedValue(new Response('unknown variant', { status: 400 }));

    await expect(NexusResourceService.fetchStream({ tags: ['music'], skip: 0, limit: 10 })).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
