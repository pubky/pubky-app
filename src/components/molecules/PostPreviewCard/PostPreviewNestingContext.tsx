'use client';

import { createContext, type ReactNode, useContext } from 'react';

/**
 * Tracks whether the current subtree is rendered inside an embedded post
 * preview (`PostPreviewCard`). Consumed by `PostLinkEmbeds` to suppress
 * in-app link embeds one level down, so mutually-linking posts can't recurse.
 */
const PostPreviewNestingContext = createContext(false);

/** Marks everything below as rendered inside an embedded post preview. */
export function PostPreviewNestingProvider({ children }: { children: ReactNode }) {
  return <PostPreviewNestingContext.Provider value={true}>{children}</PostPreviewNestingContext.Provider>;
}

/** Whether the calling component is rendered inside an embedded post preview. */
export function useIsNestedPostPreview(): boolean {
  return useContext(PostPreviewNestingContext);
}
