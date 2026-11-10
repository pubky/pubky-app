import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PINAKES_REQUEST_TIMEOUT_MS } from '@/config/pinakes';
import { ClientErrorCode, NetworkErrorCode, RateLimitErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { asOpaque } from '@/test-utils/type-assertions';
import articleFixture from './fixtures/by-uri.article.json';
import bookFixture from './fixtures/by-uri.book.json';
import eventFixture from './fixtures/by-uri.event.json';
import missingFixture from './fixtures/by-uri.missing.json';
import movieFixture from './fixtures/by-uri.movie.json';
import musicRecordingFixture from './fixtures/by-uri.music-recording.json';
import natureArticleFixture from './fixtures/by-uri.nature-article.json';
import placeFixture from './fixtures/by-uri.place.json';
import podcastFixture from './fixtures/by-uri.podcast.json';
import pubkyFixture from './fixtures/by-uri.pubky.json';
import scholarlyArticleFixture from './fixtures/by-uri.scholarly-article.json';
import unreachableFixture from './fixtures/by-uri.unreachable.json';
import videoFixture from './fixtures/by-uri.video.json';
import groupFixture from './fixtures/group.video.json';
import relatedBecauseFixture from './fixtures/search.related.because.json';
import relatedFixture from './fixtures/search.related.json';
import typeFacetFixture from './fixtures/search.type-facet.json';
import { PinakesService } from './pinakes';
import { PINAKES_UNSETTLED_CARD_STALE_TIME_MS, pinakesQueryClient } from './pinakes.query-client';
import {
  PinakesStatus,
  type TPinakesGroupDetail,
  type TPinakesResourceDetail,
  type TPinakesSearchResponse,
} from './pinakes.types';

const mocks = vi.hoisted(() => ({
  pinakesUrl: 'https://pinakes.example' as string | undefined,
}));

vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  getPinakesUrl: () => mocks.pinakesUrl,
}));

const mockFetch = vi.fn();
global.fetch = asOpaque<typeof global.fetch>(mockFetch);

// The captured responses, typed: a field the hand-written types get wrong fails the typecheck.
const RESOURCE_FIXTURES: Record<string, TPinakesResourceDetail> = {
  video: videoFixture,
  article: articleFixture,
  place: placeFixture,
  event: eventFixture,
  book: bookFixture,
  'scholarly-article': scholarlyArticleFixture,
  'nature-article': natureArticleFixture,
  podcast: podcastFixture,
  movie: movieFixture,
  'music-recording': musicRecordingFixture,
  pubky: pubkyFixture,
  missing: missingFixture,
  unreachable: unreachableFixture,
};
const GROUP_FIXTURE: TPinakesGroupDetail = groupFixture;
const RELATED_FIXTURE: TPinakesSearchResponse = relatedFixture;
const RELATED_BECAUSE_FIXTURE: TPinakesSearchResponse = relatedBecauseFixture;
const TYPE_FACET_FIXTURE: TPinakesSearchResponse = typeFacetFixture;

/** The captured body as served, byte for byte. */
function capturedBody(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', `${name}.json`), 'utf8');
}

function capturedResponse(name: string, status = 200): Response {
  return new Response(capturedBody(name), { status, headers: { 'Content-Type': 'application/json' } });
}

function requestedUrl(call = 0): URL {
  return new URL(String(mockFetch.mock.calls[call][0]));
}

beforeEach(() => {
  pinakesQueryClient.clear();
  mocks.pinakesUrl = 'https://pinakes.example';
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('captured fixtures', () => {
  it('carry the ok, missing and unreachable statuses', () => {
    const statuses = new Set(Object.values(RESOURCE_FIXTURES).map((card) => card.status));

    expect(statuses).toEqual(new Set([PinakesStatus.OK, PinakesStatus.MISSING, PinakesStatus.UNREACHABLE]));
  });

  it('include a pubky:// card with a pubky:// image and a client that opens it', () => {
    expect(pubkyFixture.uri).toMatch(/^pubky:\/\//);
    expect(pubkyFixture.image).toMatch(/^pubky:\/\//);
    expect(pubkyFixture.open_in).toEqual([{ client: 'Loopky', url: expect.stringMatching(/^https:\/\//) }]);
  });

  it('say on each related row why it is listed', () => {
    for (const card of RELATED_BECAUSE_FIXTURE.items) {
      expect(card.because?.shared).toBeGreaterThan(0);
      expect(card.because?.taggers.length).toBeGreaterThan(0);
      expect(card.because?.taggers.length).toBeLessThanOrEqual(3);
    }
  });

  it('place every card type in the schema.org tree, root first', () => {
    for (const card of [...Object.values(RESOURCE_FIXTURES), ...GROUP_FIXTURE.members, ...RELATED_FIXTURE.items]) {
      expect(card.type_path[0]).toBe('Thing');
      if (card.type) expect(card.type_path.at(-1)).toBe(card.type);
    }
    for (const facet of TYPE_FACET_FIXTURE.facets?.type ?? []) {
      expect(facet.type_path.at(-1)).toBe(facet.type);
    }
  });
});

describe('PinakesService.fetchCardByUri', () => {
  it.each(Object.keys(RESOURCE_FIXTURES))('returns the %s card as Pinakes serves it', async (name) => {
    mockFetch.mockResolvedValue(capturedResponse(`by-uri.${name}`));

    await expect(PinakesService.fetchCardByUri('https://example.com/a')).resolves.toEqual(RESOURCE_FIXTURES[name]);
  });

  it('asks by-uri with the link as one encoded query parameter', async () => {
    mockFetch.mockResolvedValue(capturedResponse('by-uri.video'));
    const uri = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1#x';

    await PinakesService.fetchCardByUri(uri);

    const url = requestedUrl();
    expect(url.origin + url.pathname).toBe('https://pinakes.example/v1/resources/by-uri');
    expect(url.searchParams.get('uri')).toBe(uri);
    expect([...url.searchParams.keys()]).toEqual(['uri']);
    expect(mockFetch.mock.calls[0][1]).toEqual({ method: 'GET', signal: expect.any(AbortSignal) });
  });

  it('keeps a path prefix of the configured origin and drops its trailing slash', async () => {
    mocks.pinakesUrl = 'https://example.org/pinakes/';
    mockFetch.mockResolvedValue(capturedResponse('by-uri.video'));

    await PinakesService.fetchCardByUri('isbn:9780140328721');

    expect(requestedUrl().pathname).toBe('/pinakes/v1/resources/by-uri');
  });

  it('answers an unknown link (404) as no card, without an error', async () => {
    mockFetch.mockResolvedValue(capturedResponse('by-uri.not-found', 404));

    await expect(PinakesService.fetchCardByUri('https://example.com/unknown')).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('makes no request when Pinakes is not configured', async () => {
    mocks.pinakesUrl = undefined;

    await expect(PinakesService.fetchCardByUri('https://example.com/a')).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('makes no request for a link longer than Pinakes accepts', async () => {
    await expect(PinakesService.fetchCardByUri(`https://example.com/${'é'.repeat(1020)}`)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('serves a second read of the same link from the cache, and shares one in flight', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(capturedResponse('by-uri.video')));

    await Promise.all([
      PinakesService.fetchCardByUri('https://example.com/a'),
      PinakesService.fetchCardByUri('https://example.com/a'),
    ]);
    await PinakesService.fetchCardByUri('https://example.com/a');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws a Pinakes client error for a 400, without retrying', async () => {
    mockFetch.mockResolvedValue(
      new Response('{"error":"invalid uri"}', { status: 400, headers: { 'Content-Type': 'application/json' } }),
    );

    // A link that does not parse is never sent (see 'with credentials'); one Pinakes refuses is.
    await expect(PinakesService.fetchCardByUri('urn:x-test:refused')).rejects.toMatchObject({
      code: ClientErrorCode.BAD_REQUEST,
      service: ErrorService.Pinakes,
      context: { endpoint: 'https://pinakes.example/v1/resources/by-uri', statusCode: 400 },
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries a 500 once, as Pinakes advises, then throws', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(() => Promise.resolve(new Response('{"error":"internal"}', { status: 500 })));

    const result = PinakesService.fetchCardByUri('https://example.com/a');
    const assertion = expect(result).rejects.toMatchObject({ code: ServerErrorCode.INTERNAL_ERROR });
    await vi.runAllTimersAsync();
    await assertion;

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('falls back at once on a 429 instead of waiting out Retry-After', async () => {
    mockFetch.mockResolvedValue(
      new Response('{"error":"rate limited"}', { status: 429, headers: { 'Retry-After': '60' } }),
    );

    await expect(PinakesService.fetchCardByUri('https://example.com/a')).rejects.toMatchObject({
      code: RateLimitErrorCode.RATE_LIMITED,
      service: ErrorService.Pinakes,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries a connection failure once, then throws a Network error', async () => {
    vi.useFakeTimers();
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = PinakesService.fetchCardByUri('https://example.com/a');
    const assertion = expect(result).rejects.toMatchObject({
      category: ErrorCategory.Network,
      service: ErrorService.Pinakes,
    });
    await vi.runAllTimersAsync();
    await assertion;

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('ends a stalled request at the deadline, retries once, then throws a Network error', async () => {
    vi.useFakeTimers();
    // Node's AbortSignal.timeout runs on internal timers the fake clock cannot advance: the same
    // signal, on the faked setTimeout.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const abort = new AbortController();
      setTimeout(() => abort.abort(new DOMException('signal timed out', 'TimeoutError')), ms);
      return abort.signal;
    });
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );

    const result = PinakesService.fetchCardByUri('https://example.com/a');
    const assertion = expect(result).rejects.toMatchObject({
      code: NetworkErrorCode.CONNECTION_FAILED,
      service: ErrorService.Pinakes,
    });
    await vi.advanceTimersByTimeAsync(PINAKES_REQUEST_TIMEOUT_MS - 1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    await assertion;

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('reads an unknown link again after 30 s, a known one only after five minutes', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(() => Promise.resolve(capturedResponse('by-uri.not-found', 404)));
    await PinakesService.fetchCardByUri('https://example.com/new');
    mockFetch.mockImplementation(() => Promise.resolve(capturedResponse('by-uri.video')));
    await PinakesService.fetchCardByUri('https://example.com/known');

    vi.advanceTimersByTime(PINAKES_UNSETTLED_CARD_STALE_TIME_MS + 1);
    await PinakesService.fetchCardByUri('https://example.com/new');
    await PinakesService.fetchCardByUri('https://example.com/known');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(requestedUrl(2).searchParams.get('uri')).toBe('https://example.com/new');
  });

  it('keeps the linked URI out of the error context', async () => {
    mockFetch.mockResolvedValue(new Response('{"error":"bad"}', { status: 400 }));

    const error = await PinakesService.fetchCardByUri('https://example.com/private?token=secret').catch((e) => e);

    expect(JSON.stringify(error.context)).not.toContain('secret');
  });
});

describe('PinakesService.fetchCardByUri recheck', () => {
  it('asks again past the cache when fresh, and keeps the answer for the next plain read', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(capturedResponse('by-uri.not-found', 404)));
    await expect(PinakesService.fetchCardByUri('https://example.com/soon')).resolves.toBeNull();
    mockFetch.mockImplementation(() => Promise.resolve(capturedResponse('by-uri.video')));

    await expect(PinakesService.fetchCardByUri('https://example.com/soon', { fresh: true })).resolves.toEqual(
      videoFixture,
    );
    await expect(PinakesService.fetchCardByUri('https://example.com/soon')).resolves.toEqual(videoFixture);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('PinakesService.resolveCard', () => {
  const URI = 'https://www.fedlex.admin.ch/eli/cc/2022/151/de';
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('posts the link to /v1/resolve and returns the card read (200)', async () => {
    mockFetch.mockResolvedValue(json(videoFixture, 200));

    await expect(PinakesService.resolveCard(URI)).resolves.toEqual(videoFixture);
    expect(mockFetch.mock.calls[0][0]).toBe('https://pinakes.example/v1/resolve');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri: URI }),
    });
  });

  it('returns the pending card of a link still being read (202)', async () => {
    const pending = { ...videoFixture, status: PinakesStatus.PENDING, name: null };
    mockFetch.mockResolvedValue(json(pending, 202));

    await expect(PinakesService.resolveCard(URI)).resolves.toEqual(pending);
  });

  it.each([400, 404, 405, 429, 503])('answers no card, quietly, on a %i (a refusal or no route)', async (status) => {
    const report = vi.spyOn(Logger, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValue(json({ error: 'no' }, status));

    await expect(PinakesService.resolveCard(URI)).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });

  it.each([500, 502])('answers no card on a %i, and reports it', async (status) => {
    const report = vi.spyOn(Logger, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValue(json({ error: 'no' }, status));

    await expect(PinakesService.resolveCard(URI)).resolves.toBeNull();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toBe(`[${ErrorService.Pinakes}:resolveCard]`);
  });

  it('answers no card when the request fails', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(PinakesService.resolveCard(URI)).resolves.toBeNull();
  });

  it('makes no request when Pinakes is not configured', async () => {
    mocks.pinakesUrl = undefined;

    await expect(PinakesService.resolveCard(URI)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each(['https://alice:secret@example.com/draft', 'https://alice@example.com/draft', 'not a link'])(
    'never sends %s, a link with credentials or one that does not parse',
    async (uri) => {
      await expect(PinakesService.resolveCard(uri)).resolves.toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );
});

describe('PinakesService.fetchCardByUri with credentials', () => {
  it.each([
    'https://alice@example.invalid/a',
    'https://alice:secret@example.invalid/a',
    'https://:secret@example.invalid/a',
    'https://alice%40home:s%3Acret@example.invalid/a',
    'not a link',
  ])('never sends %s, a link with a username or password or one that does not parse', async (uri) => {
    await expect(PinakesService.fetchCardByUri(uri)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.invalid/@alice',
    'https://example.invalid/a?by=alice@example.invalid',
    'isbn:9780140328721',
    'geo:52.5,13.4',
    'doi:10.1038/nature12373',
  ])('still reads %s', async (uri) => {
    mockFetch.mockResolvedValue(capturedResponse('by-uri.video'));

    await PinakesService.fetchCardByUri(uri);
    expect(requestedUrl().searchParams.get('uri')).toBe(uri);
  });
});

describe('PinakesService.seedCardByUri', () => {
  it('serves the seeded card to the link’s next card read without a request', async () => {
    PinakesService.seedCardByUri('https://example.com/seeded', videoFixture);

    await expect(PinakesService.fetchCardByUri('https://example.com/seeded')).resolves.toBe(videoFixture);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('PinakesService.fetchCardById', () => {
  it('reads one card by its ID, as one path segment', async () => {
    mockFetch.mockResolvedValue(capturedResponse('by-uri.video'));

    await expect(PinakesService.fetchCardById('a/b')).resolves.toEqual(videoFixture);
    expect(requestedUrl().pathname).toBe('/v1/resources/a%2Fb');
  });
});

describe('PinakesService.fetchRelated', () => {
  it('returns the related cards Pinakes ranked', async () => {
    mockFetch.mockResolvedValue(capturedResponse('search.related'));

    await expect(PinakesService.fetchRelated(videoFixture.id, 5)).resolves.toEqual(RELATED_FIXTURE.items);

    const url = requestedUrl();
    expect(url.pathname).toBe('/v1/search');
    expect(url.searchParams.get('related')).toBe(videoFixture.id);
    expect(url.searchParams.get('limit')).toBe('5');
  });

  it('returns no cards when none are related', async () => {
    mockFetch.mockResolvedValue(new Response('{"items":[],"cursor":null,"reach_truncated":false}', { status: 200 }));

    await expect(PinakesService.fetchRelated('00000000000000000000000000000000', 5)).resolves.toEqual([]);
  });

  it('makes no request when Pinakes is not configured', async () => {
    mocks.pinakesUrl = undefined;

    await expect(PinakesService.fetchRelated(videoFixture.id, 5)).resolves.toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('PinakesService.fetchGroup', () => {
  it('returns every member card of the group', async () => {
    mockFetch.mockResolvedValue(capturedResponse('group.video'));

    const group = await PinakesService.fetchGroup(groupFixture.id);

    expect(group).toEqual(GROUP_FIXTURE);
    expect(group?.members).toHaveLength(videoFixture.group.size);
    expect(requestedUrl().pathname).toBe(`/v1/groups/${groupFixture.id}`);
  });

  it('answers a group that no longer exists (404) as null', async () => {
    mockFetch.mockResolvedValue(new Response('{"error":"group not found"}', { status: 404 }));

    await expect(PinakesService.fetchGroup('00000000000000000000000000000000')).resolves.toBeNull();
  });

  it('encodes the ID as one path segment', async () => {
    mockFetch.mockResolvedValue(new Response('{"error":"invalid or disabled group"}', { status: 400 }));

    await expect(PinakesService.fetchGroup('../search')).rejects.toMatchObject({ code: ClientErrorCode.BAD_REQUEST });
    expect(requestedUrl().pathname).toBe('/v1/groups/..%2Fsearch');
  });

  it('makes no request when Pinakes is not configured', async () => {
    mocks.pinakesUrl = undefined;

    await expect(PinakesService.fetchGroup(groupFixture.id)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
