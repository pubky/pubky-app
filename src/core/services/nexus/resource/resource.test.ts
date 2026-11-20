import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNexusUrl } from '@/config/nexus';
import type { AppError as TAppError } from '@/libs/error/error';
import type { nexusQueryClient as TNexusQueryClient } from '@/services/nexus/nexus.query-client';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { mockNexusPostWire } from '@/test-utils/nexus';
import type { NexusResourceService as TNexusResourceService } from './resource';
import { resourceApi } from './resource.api';
import { RESOURCE_TAG_UNCONFIRMED_MS, RESOURCE_TAGS_LIMIT } from './resource.constants';

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
