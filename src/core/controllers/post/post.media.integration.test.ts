import { buildFile, buildPost, buildUri, buildUser, decodeObject, toPath } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostApplication } from '@/application/post/post';
import { FileController } from '@/controllers/file/file';
import { PostController } from '@/controllers/post/post';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { pickHeadVersion } from '@/pipes/post/post.head';
import type { NexusPostWithAttachmentMetadata } from '@/services/nexus/nexus.types';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { useAuthStore } from '@/stores/auth/auth.store';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';

const OWNER = fakeOwner(1) as Pubky;

// Real controllers, applications, data model and IndexedDB; the homeserver is the in-memory one
// and Nexus is a map of what it has indexed. Media is content addressed, so one file is shared by
// the avatar, posts and covers (QA-1 BUG-2: removing a collection cover deleted such a file).
describe('content-addressed media lifetime', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  /** What Nexus has indexed, by composite post id. */
  let indexed: Map<string, NexusPostWithAttachmentMetadata>;

  const media = (byte: number, type = 'image/png') => {
    const bytes = new Uint8Array([byte, byte, byte]);
    return { ...buildFile(OWNER, { bytes, type }), bytes };
  };
  const store = async (file: ReturnType<typeof media>) => {
    await homeserver.session.storage.putBytes(toPath(file.url), file.bytes);
    return file.url;
  };
  const stored = (url: string) => homeserver.session.storage.exists(toPath(url));

  const publishProfile = async (image: string | null) => {
    const user = buildUser(OWNER, { name: 'Alice', image });
    await homeserver.session.storage.putBytes(toPath(user.url), user.body);
  };

  /** Publishes a post through the real create path (Dexie row + PUT), and indexes it on Nexus. */
  const publish = async (post: ReturnType<typeof buildPost>) => {
    const compositePostId = `${OWNER}:${post.id}`;
    await PostApplication.commitCreate({ compositePostId, post });
    indexed.set(compositePostId, {
      details: {
        id: post.id,
        author: OWNER,
        content: post.object.content,
        kind: post.object.kind,
        uri: buildUri(OWNER, 'post', post.id),
        attachments: post.object.attachments.map(({ uri }) => uri),
        indexed_at: 1,
      },
      counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
      tags: [],
      relationships: { replied: null, reposted: null, mentioned: [] },
      bookmark: null,
    });
    return compositePostId;
  };
  /** A post this device never cached: on the homeserver and Nexus, absent from Dexie. */
  const publishElsewhere = async (post: ReturnType<typeof buildPost>) => {
    const compositePostId = await publish(post);
    await PostDetailsModel.table.delete(compositePostId);
    return compositePostId;
  };

  const head = async (compositePostId: string) => {
    const id = compositePostId.split(':')[1];
    const url = pickHeadVersion(
      await homeserver.session.storage.list(`/pub/social/v1/posts/${id}/`, null, false, 100, false),
    );
    return decodeObject(url!, await homeserver.session.storage.getBytes(toPath(url!)), 'post');
  };

  beforeEach(async () => {
    homeserver = stubMemoryHomeserver(OWNER);
    indexed = new Map();
    useAuthStore.setState({ currentUserPubky: OWNER });
    vi.spyOn(NexusPostStreamService, 'fetchByIds').mockImplementation(async ({ post_ids }) =>
      post_ids.flatMap((id) => indexed.get(id) ?? []),
    );
    vi.spyOn(Logger, 'debug').mockImplementation(() => {});
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    await Promise.all([PostDetailsModel.table.clear(), UserDetailsModel.table.clear()]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('edits never delete media', () => {
    it('BUG-2: removing a collection cover keeps the file the avatar and an uncached post still use', async () => {
      // The migrated "Reading list": its cover is the avatar's bytes and a photo of a post that
      // lies beyond the loaded pages (not in Dexie), all one content-addressed file.
      const shared = await store(media(1));
      const pdf = await store(media(2, 'application/pdf'));
      await publishProfile(shared);
      await publishElsewhere(
        buildPost(OWNER, { content: 'photo', kind: 'image', attachments: [{ uri: shared }, { uri: pdf }] }),
      );
      const readingList = await publish(
        buildPost(OWNER, { kind: 'collection', name: 'Reading list', items: [], cover_image: shared }),
      );

      await PostController.commitEditCollection({
        compositeCollectionId: readingList,
        name: 'Reading list',
        coverImage: null,
      });

      // The new version has no cover
      const envelope = JSON.parse((await head(readingList)).content);
      expect(envelope.name).toBe('Reading list');
      expect(envelope.cover_image ?? null).toBeNull();
      expect(await stored(shared)).toBe(true);
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
    });

    it('keeps an attachment the edit removed: the first version still references it', async () => {
      const kept = await store(media(1));
      const removed = await store(media(2));
      const post = await publish(
        buildPost(OWNER, { content: 'pics', kind: 'image', attachments: [{ uri: kept }, { uri: removed }] }),
      );

      await PostController.commitEdit({
        compositePostId: post,
        content: 'pics',
        attachments: { original: [kept, removed], kept: [kept], added: [] },
      });

      expect((await head(post)).attachments.map(({ uri }) => uri)).toEqual([kept]);
      expect(await stored(removed)).toBe(true);
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
    });

    it("keeps an article's replaced cover", async () => {
      const cover = await store(media(1));
      const nextCover = await store(media(2));
      const article = await publish(buildPost(OWNER, { kind: 'article', title: 'T', body: 'b', cover_image: cover }));

      await PostController.commitEdit({
        compositePostId: article,
        content: JSON.stringify({ title: 'T', body: 'b' }),
        coverImage: nextCover,
      });

      expect(JSON.parse((await head(article)).content)).toMatchObject({ cover_image: nextCover });
      expect(await stored(cover)).toBe(true);
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalledWith(cover);
    });
  });

  describe('post delete', () => {
    let file: string;
    let post: string;

    beforeEach(async () => {
      file = await store(media(1));
      await publishProfile(null);
      post = await publish(buildPost(OWNER, { content: 'photo', kind: 'image', attachments: [{ uri: file }] }));
    });

    it('deletes the file when the cache, the profile and every indexed post leave it unreferenced', async () => {
      await publishElsewhere(buildPost(OWNER, { content: 'unrelated' }));

      await PostController.commitDelete({ compositePostId: post });

      expect(await stored(file)).toBe(false);
      expect(NexusPostStreamService.fetchByIds).toHaveBeenCalledWith(
        expect.objectContaining({ force: true, include_attachment_metadata: false }),
      );
    });

    it('keeps the file the published profile uses as its avatar', async () => {
      await publishProfile(file);

      await PostController.commitDelete({ compositePostId: post });

      expect(await stored(file)).toBe(true);
    });

    it('keeps the file the cached profile uses, without asking the homeserver', async () => {
      await UserDetailsModel.table.put({
        id: OWNER,
        name: 'Alice',
        bio: '',
        image: file,
        links: [],
        status: null,
        indexed_at: 1,
      });

      await PostController.commitDelete({ compositePostId: post });

      expect(await stored(file)).toBe(true);
      expect(homeserver.spies.getFreshBytes).not.toHaveBeenCalled();
    });

    it('keeps the file another cached post references, without asking Nexus', async () => {
      await publish(buildPost(OWNER, { content: 'again', kind: 'image', attachments: [{ uri: file }] }));

      await PostController.commitDelete({ compositePostId: post });

      expect(await stored(file)).toBe(true);
      expect(NexusPostStreamService.fetchByIds).not.toHaveBeenCalled();
    });

    it('keeps the file a post this device never cached references: Nexus lists it', async () => {
      await publishElsewhere(buildPost(OWNER, { content: 'again', kind: 'image', attachments: [{ uri: file }] }));

      await PostController.commitDelete({ compositePostId: post });

      expect(await stored(file)).toBe(true);
    });

    it('keeps the file an uncached collection uses as its cover', async () => {
      await publishElsewhere(buildPost(OWNER, { kind: 'collection', name: 'Covers', items: [], cover_image: file }));

      await PostController.commitDelete({ compositePostId: post });

      expect(await stored(file)).toBe(true);
    });

    it('keeps the file, with a warning, when Nexus has not indexed a post the homeserver lists', async () => {
      const lagging = await publishElsewhere(buildPost(OWNER, { content: 'just written elsewhere' }));
      indexed.delete(lagging);

      await PostController.commitDelete({ compositePostId: post });

      expect(await stored(file)).toBe(true);
      expect(Logger.warn).toHaveBeenCalledWith(
        '[FileApplication] Kept media: Nexus has not indexed every post of the owner',
        expect.objectContaining({ owner: OWNER, fileUris: [file], unindexed: [lagging] }),
      );
    });

    it('keeps the file, with a warning, when the Nexus check fails', async () => {
      await publishElsewhere(buildPost(OWNER, { content: 'unrelated' }));
      vi.mocked(NexusPostStreamService.fetchByIds).mockRejectedValue(new Error('Nexus unavailable'));

      await expect(PostController.commitDelete({ compositePostId: post })).resolves.toBeUndefined();

      expect(await stored(file)).toBe(true);
      expect(Logger.warn).toHaveBeenCalledWith(
        '[FileApplication] Kept media whose references could not be checked',
        expect.objectContaining({ owner: OWNER, fileUris: [file] }),
      );
    });

    it('keeps the file when the published profile cannot be read', async () => {
      await homeserver.session.storage.delete(toPath(buildUri(OWNER, 'user')));

      await PostController.commitDelete({ compositePostId: post });

      expect(await stored(file)).toBe(true);
      expect(NexusPostStreamService.fetchByIds).not.toHaveBeenCalled();
    });
  });

  describe('a discarded composer upload', () => {
    it('is deleted when nothing references it, and kept when its bytes are the avatar', async () => {
      const draftOnly = await store(media(1));
      const avatar = await store(media(2));
      await publishProfile(avatar);

      await FileController.commitDelete({ fileUris: [draftOnly, avatar] });

      expect(await stored(draftOnly)).toBe(false);
      expect(await stored(avatar)).toBe(true);
    });
  });
});
