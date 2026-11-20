import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNexusUrl } from '@/config/nexus';
import { AppError } from '@/libs/error/error';
import { nexusQueryClient } from '@/services/nexus/nexus.query-client';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { NexusResourceService } from './resource';
import { resourceApi } from './resource.api';
import { RESOURCE_TAGS_LIMIT } from './resource.constants';

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
    nexusQueryClient.clear();
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
    expect(JSON.stringify((error as AppError).context)).not.toContain('openstreetmap');
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

  it('applies nothing when the link was never read', () => {
    NexusResourceService.applyViewerTag({ uri: URI, label: 'city', viewerId: VIEWER }, true);

    expect(nexusQueryClient.getQueryData(['nexus', 'resource', 'by-uri', URI, VIEWER])).toBeUndefined();
  });
});
