import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { LocalFilesActionTypes, localFilesInitialState, LocalFilesStore } from './localFiles.types';

/**
 * Safely revoke a blob URL to prevent memory leaks.
 * Only revokes URLs that start with 'blob:'.
 */
const revokeBlobUrl = (url: string | null | undefined): void => {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

export const useLocalFilesStore = create<LocalFilesStore>()(
  devtools(
    (set, get) => ({
      ...localFilesInitialState,

      setProfile: (blobUrl) => {
        const prev = get().profile;
        revokeBlobUrl(prev);
        set({ profile: blobUrl }, false, LocalFilesActionTypes.SET_PROFILE);
      },

      setPostAttachments: (postId, attachments) => {
        // Set-difference revoke: an edit's merged list may reuse blob URLs from
        // the previous entry (kept attachments of a same-session create) — only
        // URLs absent from the incoming list are revoked.
        const nextUrls = new Set(attachments.flatMap((a) => [a.urls.main, a.urls.feed]));
        const prev = get().posts[postId];
        prev?.forEach((a) => {
          if (!nextUrls.has(a.urls.main)) revokeBlobUrl(a.urls.main);
        });

        if (attachments.length === 0) {
          // Remove key if empty array
          set(
            (state) => {
              const { [postId]: _, ...rest } = state.posts;
              return { posts: rest };
            },
            false,
            LocalFilesActionTypes.SET_POST_ATTACHMENTS,
          );
        } else {
          set(
            (state) => ({ posts: { ...state.posts, [postId]: attachments } }),
            false,
            LocalFilesActionTypes.SET_POST_ATTACHMENTS,
          );
        }
      },

      setCollectionCover: (collectionId, blobUrl) => {
        const prev = get().collections[collectionId];
        revokeBlobUrl(prev);

        if (blobUrl === null) {
          set(
            (state) => {
              const { [collectionId]: _, ...rest } = state.collections;
              return { collections: rest };
            },
            false,
            LocalFilesActionTypes.SET_COLLECTION_COVER,
          );
        } else {
          set(
            (state) => ({ collections: { ...state.collections, [collectionId]: blobUrl } }),
            false,
            LocalFilesActionTypes.SET_COLLECTION_COVER,
          );
        }
      },

      reset: () => {
        const state = get();
        revokeBlobUrl(state.profile);
        Object.values(state.posts)
          .flat()
          .forEach((a) => revokeBlobUrl(a?.urls.main));
        Object.values(state.collections).forEach((url) => revokeBlobUrl(url));
        set(localFilesInitialState, false, LocalFilesActionTypes.RESET);
      },
    }),
    {
      name: 'local-files-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
