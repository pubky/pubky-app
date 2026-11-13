import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { NexusResourceService } from '@/services/nexus/resource/resource';
import { TagApplication } from './tag';

vi.mock('@/services/homeserver/homeserver', () => ({ HomeserverService: { request: vi.fn(), putBlob: vi.fn() } }));
vi.mock('@/services/nexus/resource/resource', () => ({
  NexusResourceService: {
    fetchTagsByUri: vi.fn(),
    fetchBatchedTags: vi.fn(),
    applyViewerTag: vi.fn(),
    getCachedTags: vi.fn(),
    subscribeTags: vi.fn(),
    hasUnconfirmedTags: vi.fn(),
    isByIdsServed: vi.fn(),
  },
}));

const URI = 'https://www.openstreetmap.org/node/240109189';
const VIEWER = 'viewer';
const TAG_URL = `pubky://${VIEWER}/pub/social/v1/tags/ABC.json`;
const BODY = new TextEncoder().encode('{"uri":"x","label":"berlin"}');
const VIEWER_TAG = { uri: URI, label: 'berlin', viewerId: VIEWER };

describe('TagApplication, external resources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(HomeserverService.putBlob).mockResolvedValue(undefined);
    vi.mocked(HomeserverService.request).mockResolvedValue(undefined);
  });

  it('reads the tags from Nexus', async () => {
    vi.mocked(NexusResourceService.fetchTagsByUri).mockResolvedValue([]);

    await expect(TagApplication.fetchResourceTags({ uri: URI, viewerId: VIEWER })).resolves.toEqual([]);
    expect(NexusResourceService.fetchTagsByUri).toHaveBeenCalledWith({ uri: URI, viewerId: VIEWER });
  });

  describe('another link of a card in a feed (`byIdsOnly`)', () => {
    it('reads it only in the batch, with the links asked at the same moment, even before `by_ids` is known', async () => {
      const tags = [{ label: 'rock', taggers: ['a'], taggers_count: 1, relationship: false, tag_uri: null }];
      vi.mocked(NexusResourceService.isByIdsServed).mockReturnValue(false);
      vi.mocked(NexusResourceService.fetchBatchedTags).mockResolvedValue(tags);

      await expect(TagApplication.fetchResourceTags({ uri: URI, viewerId: VIEWER, byIdsOnly: true })).resolves.toEqual(
        tags,
      );
      expect(NexusResourceService.fetchBatchedTags).toHaveBeenCalledWith({ uri: URI, viewerId: VIEWER });
      expect(NexusResourceService.fetchTagsByUri).not.toHaveBeenCalled();
    });

    it('has no tags when the batch could not answer it (no `by_ids`): nothing else is asked', async () => {
      vi.mocked(NexusResourceService.fetchBatchedTags).mockResolvedValue(undefined);

      await expect(TagApplication.fetchResourceTags({ uri: URI, viewerId: VIEWER, byIdsOnly: true })).resolves.toEqual(
        [],
      );
      expect(NexusResourceService.fetchTagsByUri).not.toHaveBeenCalled();
    });
  });

  describe('a link read with its other spellings', () => {
    const SHARE = `${URI}/u`;
    const tag = (label: string, taggers: string[], extra = {}) => ({
      label,
      taggers,
      taggers_count: taggers.length,
      relationship: false,
      tag_uri: null,
      ...extra,
    });
    const answers: Record<string, ReturnType<typeof tag>[]> = {
      [URI]: [tag('punk', ['a'])],
      [SHARE]: [tag('punk', ['b']), tag('rock', [VIEWER], { relationship: true, tag_uri: TAG_URL })],
    };

    beforeEach(() => {
      vi.mocked(NexusResourceService.isByIdsServed).mockReturnValue(true);
    });

    it('reads the link alone on a Nexus without `by_ids`, once its own read found that out', async () => {
      vi.mocked(NexusResourceService.isByIdsServed).mockReturnValue(false);
      vi.mocked(NexusResourceService.fetchTagsByUri).mockImplementation(async ({ uri }) => answers[uri]);

      await expect(TagApplication.fetchResourceTags({ uri: URI, spellings: [SHARE] })).resolves.toEqual(answers[URI]);
      expect(NexusResourceService.fetchTagsByUri).toHaveBeenCalledTimes(1);
    });

    it('reads the spellings once the link’s own read found `by_ids` served', async () => {
      vi.mocked(NexusResourceService.isByIdsServed).mockReturnValueOnce(false).mockReturnValue(true);
      vi.mocked(NexusResourceService.fetchTagsByUri).mockImplementation(async ({ uri }) => answers[uri]);

      const tags = await TagApplication.fetchResourceTags({ uri: URI, spellings: [SHARE] });

      expect(NexusResourceService.fetchTagsByUri).toHaveBeenCalledTimes(2);
      expect(tags.map((entry) => entry.label)).toEqual(['punk', 'rock']);
    });

    it('reads the spellings on a Nexus without `by_ids` with `spellingsByUri` (the resource page)', async () => {
      vi.mocked(NexusResourceService.isByIdsServed).mockReturnValue(false);
      vi.mocked(NexusResourceService.fetchTagsByUri).mockImplementation(async ({ uri }) => answers[uri]);

      await TagApplication.fetchResourceTags({ uri: URI, spellings: [SHARE], spellingsByUri: true });

      expect(NexusResourceService.fetchTagsByUri).toHaveBeenCalledTimes(2);
    });

    it('reads every spelling and merges their tags', async () => {
      vi.mocked(NexusResourceService.fetchTagsByUri).mockImplementation(async ({ uri }) => answers[uri]);

      const tags = await TagApplication.fetchResourceTags({ uri: URI, viewerId: VIEWER, spellings: [SHARE] });

      expect(NexusResourceService.fetchTagsByUri).toHaveBeenCalledTimes(2);
      expect(tags.map((entry) => [entry.label, entry.taggers_count, entry.relationship])).toEqual([
        ['punk', 2, false],
        ['rock', 1, true],
      ]);
    });

    it('leaves out a spelling whose read failed, and fails only when every read did', async () => {
      vi.mocked(NexusResourceService.fetchTagsByUri).mockImplementation(async ({ uri }) => {
        if (uri === SHARE) throw new Error('down');
        return answers[uri];
      });
      await expect(TagApplication.fetchResourceTags({ uri: URI, spellings: [SHARE] })).resolves.toEqual(answers[URI]);

      vi.mocked(NexusResourceService.fetchTagsByUri).mockRejectedValue(new Error('down'));
      await expect(TagApplication.fetchResourceTags({ uri: URI, spellings: [SHARE] })).rejects.toThrow('down');
    });

    it('keeps a link’s last answer when a fresh read of it fails', async () => {
      vi.mocked(NexusResourceService.fetchTagsByUri).mockImplementation(async ({ uri }) => {
        if (uri === URI) throw new Error('429');
        return answers[uri];
      });
      vi.mocked(NexusResourceService.getCachedTags).mockImplementation(({ uri }) =>
        uri === URI ? answers[URI] : undefined,
      );

      const tags = await TagApplication.fetchResourceTags({
        uri: URI,
        viewerId: VIEWER,
        spellings: [SHARE],
        fresh: true,
      });

      expect(tags.find((entry) => entry.label === 'punk')?.taggers_count).toBe(2);
    });

    it('follows every spelling’s answer, merged with the answers read so far', () => {
      const listeners: (() => void)[] = [];
      const unsubscribe = vi.fn();
      vi.mocked(NexusResourceService.subscribeTags).mockImplementation((_key, listener) => {
        listeners.push(() => listener([]));
        return unsubscribe;
      });
      const cached: Record<string, ReturnType<typeof tag>[] | undefined> = { [URI]: answers[URI] };
      vi.mocked(NexusResourceService.getCachedTags).mockImplementation(({ uri }) => cached[uri]);
      const listener = vi.fn();

      const stop = TagApplication.subscribeResourceTags({ uri: URI, viewerId: VIEWER, spellings: [SHARE] }, listener);
      listeners[0]();
      // The spelling not read (or whose read failed) is left out.
      expect(listener).toHaveBeenLastCalledWith(answers[URI]);
      cached[SHARE] = answers[SHARE];
      listeners[1]();
      expect(listener).toHaveBeenLastCalledWith([
        expect.objectContaining({ label: 'punk', taggers_count: 2 }),
        expect.objectContaining({ label: 'rock' }),
      ]);
      stop();
      expect(unsubscribe).toHaveBeenCalledTimes(2);
    });

    it('names the spellings the viewer’s tag is on, with their files', () => {
      vi.mocked(NexusResourceService.getCachedTags).mockImplementation(({ uri }) => answers[uri]);

      expect(TagApplication.getViewerResourceTagLinks({ uris: [URI, SHARE], viewerId: VIEWER, label: 'Rock' })).toEqual(
        [{ uri: SHARE, tagUri: TAG_URL }],
      );
      expect(TagApplication.getViewerResourceTagLinks({ uris: [URI, SHARE], viewerId: VIEWER, label: 'punk' })).toEqual(
        [],
      );
    });

    it('has an unconfirmed write when any spelling has one', () => {
      vi.mocked(NexusResourceService.hasUnconfirmedTags).mockImplementation(({ uri }) => uri === SHARE);

      expect(TagApplication.hasUnconfirmedResourceTags({ uri: URI, spellings: [SHARE] })).toBe(true);
      expect(TagApplication.hasUnconfirmedResourceTags({ uri: URI })).toBe(false);
    });
  });

  it('PUTs the built tag, then applies it to the shared Nexus answer', async () => {
    await TagApplication.commitCreateResource({ tagUrl: TAG_URL, tagBody: BODY }, VIEWER_TAG);

    expect(HomeserverService.putBlob).toHaveBeenCalledWith({ url: TAG_URL, blob: BODY });
    expect(NexusResourceService.applyViewerTag).toHaveBeenCalledWith({ ...VIEWER_TAG, tagUri: TAG_URL }, true);
  });

  it('applies nothing when the PUT fails', async () => {
    vi.mocked(HomeserverService.putBlob).mockRejectedValue(new Error('down'));

    await expect(TagApplication.commitCreateResource({ tagUrl: TAG_URL, tagBody: BODY }, VIEWER_TAG)).rejects.toThrow(
      'down',
    );
    expect(NexusResourceService.applyViewerTag).not.toHaveBeenCalled();
  });

  it('writes nothing for a session that ended', async () => {
    await TagApplication.commitCreateResource({ tagUrl: TAG_URL, tagBody: BODY, isCurrent: () => false }, VIEWER_TAG);
    await TagApplication.commitDeleteResource(
      { tagUri: TAG_URL, isCurrent: () => false, canWrite: () => true },
      VIEWER_TAG,
    );

    expect(HomeserverService.putBlob).not.toHaveBeenCalled();
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });

  it('DELETEs the tag file, then drops it from the shared Nexus answer', async () => {
    await TagApplication.commitDeleteResource({ tagUri: TAG_URL, canWrite: () => true }, VIEWER_TAG);

    expect(HomeserverService.request).toHaveBeenCalledWith({ method: HttpMethod.DELETE, url: TAG_URL });
    expect(NexusResourceService.applyViewerTag).toHaveBeenCalledWith(VIEWER_TAG, false);
  });

  it('DELETEs a second file of the same tag too, once', async () => {
    const other = TAG_URL.replace(/[^/]+\.json$/, 'OTHER.json');

    await TagApplication.commitDeleteResource({ tagUri: TAG_URL, alsoTagUri: other, canWrite: () => true }, VIEWER_TAG);
    await TagApplication.commitDeleteResource(
      { tagUri: TAG_URL, alsoTagUri: TAG_URL, canWrite: () => true },
      VIEWER_TAG,
    );

    // The second file first: a failure on the file Nexus reports leaves the tag as it was.
    expect(vi.mocked(HomeserverService.request).mock.calls.map(([request]) => request.url)).toEqual([
      other,
      TAG_URL,
      TAG_URL,
    ]);
  });

  it('refuses both files when the session cannot write one of them', async () => {
    await expect(
      TagApplication.commitDeleteResource(
        { tagUri: TAG_URL, alsoTagUri: 'pubky://x/pub/other/tags/1', canWrite: (file) => file === TAG_URL },
        VIEWER_TAG,
      ),
    ).rejects.toBeInstanceOf(AppError);
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });

  it('treats an already absent tag file as deleted', async () => {
    vi.mocked(HomeserverService.request).mockRejectedValue(
      new AppError({
        category: ErrorCategory.Client,
        code: ClientErrorCode.NOT_FOUND,
        message: 'Not found',
        service: ErrorService.Homeserver,
        operation: 'request',
      }),
    );

    await expect(
      TagApplication.commitDeleteResource({ tagUri: TAG_URL, canWrite: () => true }, VIEWER_TAG),
    ).resolves.toBeUndefined();
    expect(NexusResourceService.applyViewerTag).toHaveBeenCalledWith(VIEWER_TAG, false);
  });

  it('refuses a tag file the session cannot write', async () => {
    await expect(
      TagApplication.commitDeleteResource({ tagUri: TAG_URL, canWrite: () => false }, VIEWER_TAG),
    ).rejects.toBeInstanceOf(AppError);
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });
});
