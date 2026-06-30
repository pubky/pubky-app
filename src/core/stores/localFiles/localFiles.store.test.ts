import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { useLocalFilesStore } from './localFiles.store';

// Helper to create mock attachments
const createMockAttachment = (mainUrl: string, feedUrl?: string): AttachmentConstructed => ({
  type: 'image',
  name: 'test.jpg',
  urls: {
    main: mainUrl,
    ...(feedUrl && { feed: feedUrl }),
  },
});

describe('LocalFilesStore', () => {
  // Mock URL.revokeObjectURL to track calls
  const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  beforeEach(() => {
    // Reset the store to initial state before each test
    useLocalFilesStore.setState({ profile: null, posts: {}, collections: {} });
    revokeObjectURLSpy.mockClear();
  });

  describe('Initial State', () => {
    it('should have profile set to null initially', () => {
      const state = useLocalFilesStore.getState();
      expect(state.profile).toBeNull();
    });

    it('should have posts set to empty object initially', () => {
      const state = useLocalFilesStore.getState();
      expect(state.posts).toEqual({});
    });

    it('should have collections set to empty object initially', () => {
      const state = useLocalFilesStore.getState();
      expect(state.collections).toEqual({});
    });
  });

  describe('setProfile', () => {
    it('should set profile blob URL', () => {
      useLocalFilesStore.getState().setProfile('blob:http://localhost/abc123');
      expect(useLocalFilesStore.getState().profile).toBe('blob:http://localhost/abc123');
    });

    it('should clear profile when set to null', () => {
      useLocalFilesStore.getState().setProfile('blob:http://localhost/abc123');
      useLocalFilesStore.getState().setProfile(null);
      expect(useLocalFilesStore.getState().profile).toBeNull();
    });

    it('should revoke previous blob URL when setting new one', () => {
      const oldBlobUrl = 'blob:http://localhost/old123';
      const newBlobUrl = 'blob:http://localhost/new456';

      useLocalFilesStore.getState().setProfile(oldBlobUrl);
      revokeObjectURLSpy.mockClear(); // Clear the call from initial set

      useLocalFilesStore.getState().setProfile(newBlobUrl);

      expect(revokeObjectURLSpy).toHaveBeenCalledWith(oldBlobUrl);
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);
    });

    it('should revoke previous blob URL when setting to null', () => {
      const oldBlobUrl = 'blob:http://localhost/old123';

      useLocalFilesStore.getState().setProfile(oldBlobUrl);
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().setProfile(null);

      expect(revokeObjectURLSpy).toHaveBeenCalledWith(oldBlobUrl);
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);
    });

    it('should not revoke non-blob URLs', () => {
      const httpUrl = 'https://example.com/avatar.png';

      useLocalFilesStore.getState().setProfile(httpUrl);
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().setProfile('blob:http://localhost/new456');

      // Should not revoke the http URL
      expect(revokeObjectURLSpy).not.toHaveBeenCalledWith(httpUrl);
    });

    it('should not call revokeObjectURL when previous value is null', () => {
      useLocalFilesStore.getState().setProfile('blob:http://localhost/abc123');
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    });
  });

  describe('setPostAttachments', () => {
    const postId = 'pk:abc123/posts/xyz789';
    const attachments: AttachmentConstructed[] = [
      createMockAttachment('blob:http://localhost/attach1'),
      createMockAttachment('blob:http://localhost/attach2'),
    ];

    it('should set post attachments', () => {
      useLocalFilesStore.getState().setPostAttachments(postId, attachments);
      expect(useLocalFilesStore.getState().posts[postId]).toEqual(attachments);
    });

    it('should remove post key when setting empty array', () => {
      useLocalFilesStore.getState().setPostAttachments(postId, attachments);
      useLocalFilesStore.getState().setPostAttachments(postId, []);
      expect(useLocalFilesStore.getState().posts[postId]).toBeUndefined();
      expect(postId in useLocalFilesStore.getState().posts).toBe(false);
    });

    it('should revoke previous blob URLs when setting new attachments', () => {
      const oldAttachments: AttachmentConstructed[] = [
        createMockAttachment('blob:http://localhost/old1'),
        createMockAttachment('blob:http://localhost/old2'),
      ];
      const newAttachments: AttachmentConstructed[] = [createMockAttachment('blob:http://localhost/new1')];

      useLocalFilesStore.getState().setPostAttachments(postId, oldAttachments);
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().setPostAttachments(postId, newAttachments);

      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/old1');
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/old2');
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(2);
    });

    it('should revoke previous blob URLs when clearing attachments', () => {
      useLocalFilesStore.getState().setPostAttachments(postId, attachments);
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().setPostAttachments(postId, []);

      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/attach1');
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/attach2');
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple posts independently', () => {
      const postId2 = 'pk:abc123/posts/def456';
      const attachments2: AttachmentConstructed[] = [createMockAttachment('blob:http://localhost/other')];

      useLocalFilesStore.getState().setPostAttachments(postId, attachments);
      useLocalFilesStore.getState().setPostAttachments(postId2, attachments2);

      expect(useLocalFilesStore.getState().posts[postId]).toEqual(attachments);
      expect(useLocalFilesStore.getState().posts[postId2]).toEqual(attachments2);
    });

    it('should not revoke when no previous attachments exist', () => {
      useLocalFilesStore.getState().setPostAttachments(postId, attachments);
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    });
  });

  describe('setCollectionCover', () => {
    const collectionId = 'pk:abc123/posts/collection1';

    it('should set the collection cover blob URL', () => {
      useLocalFilesStore.getState().setCollectionCover(collectionId, 'blob:http://localhost/cover1');
      expect(useLocalFilesStore.getState().collections[collectionId]).toBe('blob:http://localhost/cover1');
    });

    it('should remove the collection key when cleared with null', () => {
      useLocalFilesStore.getState().setCollectionCover(collectionId, 'blob:http://localhost/cover1');
      useLocalFilesStore.getState().setCollectionCover(collectionId, null);
      expect(useLocalFilesStore.getState().collections[collectionId]).toBeUndefined();
      expect(collectionId in useLocalFilesStore.getState().collections).toBe(false);
    });

    it('should revoke the previous blob URL when overwritten', () => {
      const oldBlobUrl = 'blob:http://localhost/old-cover';
      const newBlobUrl = 'blob:http://localhost/new-cover';

      useLocalFilesStore.getState().setCollectionCover(collectionId, oldBlobUrl);
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().setCollectionCover(collectionId, newBlobUrl);

      expect(revokeObjectURLSpy).toHaveBeenCalledWith(oldBlobUrl);
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);
    });

    it('should revoke the previous blob URL when cleared with null', () => {
      const oldBlobUrl = 'blob:http://localhost/old-cover';

      useLocalFilesStore.getState().setCollectionCover(collectionId, oldBlobUrl);
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().setCollectionCover(collectionId, null);

      expect(revokeObjectURLSpy).toHaveBeenCalledWith(oldBlobUrl);
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);
    });

    it('should not revoke non-blob URLs (e.g. CDN URLs stored externally)', () => {
      const httpUrl = 'https://cdn.example.com/cover.png';

      useLocalFilesStore.getState().setCollectionCover(collectionId, httpUrl);
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().setCollectionCover(collectionId, 'blob:http://localhost/new-cover');

      expect(revokeObjectURLSpy).not.toHaveBeenCalledWith(httpUrl);
    });

    it('should handle multiple collections independently', () => {
      const collectionId2 = 'pk:abc123/posts/collection2';

      useLocalFilesStore.getState().setCollectionCover(collectionId, 'blob:http://localhost/c1');
      useLocalFilesStore.getState().setCollectionCover(collectionId2, 'blob:http://localhost/c2');

      expect(useLocalFilesStore.getState().collections[collectionId]).toBe('blob:http://localhost/c1');
      expect(useLocalFilesStore.getState().collections[collectionId2]).toBe('blob:http://localhost/c2');
    });

    it('should not call revokeObjectURL when there is no previous entry', () => {
      useLocalFilesStore.getState().setCollectionCover(collectionId, 'blob:http://localhost/cover1');
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should reset profile to null', () => {
      useLocalFilesStore.getState().setProfile('blob:http://localhost/profile');
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().reset();

      expect(useLocalFilesStore.getState().profile).toBeNull();
    });

    it('should reset posts to empty object', () => {
      useLocalFilesStore.getState().setPostAttachments('post1', [createMockAttachment('blob:http://localhost/a')]);
      useLocalFilesStore.getState().setPostAttachments('post2', [createMockAttachment('blob:http://localhost/b')]);
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().reset();

      expect(useLocalFilesStore.getState().posts).toEqual({});
    });

    it('should reset collections to empty object and revoke their blob URLs', () => {
      const cover1 = 'blob:http://localhost/cover1';
      const cover2 = 'blob:http://localhost/cover2';
      useLocalFilesStore.getState().setCollectionCover('col1', cover1);
      useLocalFilesStore.getState().setCollectionCover('col2', cover2);
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().reset();

      expect(useLocalFilesStore.getState().collections).toEqual({});
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(cover1);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(cover2);
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(2);
    });

    it('should revoke profile blob URL on reset', () => {
      const profileUrl = 'blob:http://localhost/profile';
      useLocalFilesStore.getState().setProfile(profileUrl);
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().reset();

      expect(revokeObjectURLSpy).toHaveBeenCalledWith(profileUrl);
    });

    it('should revoke all post attachment blob URLs on reset', () => {
      const attachments1: AttachmentConstructed[] = [
        createMockAttachment('blob:http://localhost/post1-a'),
        createMockAttachment('blob:http://localhost/post1-b'),
      ];
      const attachments2: AttachmentConstructed[] = [createMockAttachment('blob:http://localhost/post2-a')];

      useLocalFilesStore.getState().setPostAttachments('post1', attachments1);
      useLocalFilesStore.getState().setPostAttachments('post2', attachments2);
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().reset();

      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/post1-a');
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/post1-b');
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/post2-a');
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(3);
    });

    it('should revoke both profile and post URLs on reset', () => {
      const profileUrl = 'blob:http://localhost/profile';
      const postAttachments: AttachmentConstructed[] = [createMockAttachment('blob:http://localhost/post')];

      useLocalFilesStore.getState().setProfile(profileUrl);
      useLocalFilesStore.getState().setPostAttachments('post1', postAttachments);
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().reset();

      expect(revokeObjectURLSpy).toHaveBeenCalledWith(profileUrl);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/post');
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(2);
    });

    it('should not call revokeObjectURL for non-blob URLs', () => {
      useLocalFilesStore.setState({
        profile: 'https://example.com/avatar.png',
        posts: { post1: [createMockAttachment('https://example.com/attach.png')] },
        collections: { col1: 'https://cdn.example.com/cover.png' },
      });
      revokeObjectURLSpy.mockClear();

      useLocalFilesStore.getState().reset();

      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    });

    it('should handle reset when store is already empty', () => {
      useLocalFilesStore.getState().reset();

      expect(useLocalFilesStore.getState().profile).toBeNull();
      expect(useLocalFilesStore.getState().posts).toEqual({});
      expect(useLocalFilesStore.getState().collections).toEqual({});
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    });
  });
});
