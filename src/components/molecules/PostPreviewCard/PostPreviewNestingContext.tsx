'use client';

import { createContext, type ReactNode, useContext } from 'react';

/**
 * Tracks whether the current subtree is rendered inside an embedded post
 * preview (`PostPreviewCard`). Consumed by `PostLinkEmbeds` to suppress
 * in-app link embeds one level down, so mutually-linking posts can't recurse.
 */
const PostPreviewNestingContext = createContext(false);

/**
 * Whether inline links in the current subtree (mentions, hashtags) may change
 * the route. `true` everywhere except inside a `PostPreviewCard` rendered with
 * `navigable={false}` — the quoted post in the Reply/Repost dialogs — where a
 * navigation would land behind the open modal, and the composer's link preview,
 * where it would leave the post being written. The leaves read it directly
 * because they sit several layers down the markdown render. Resource previews
 * read `false` as a post being written: no card player opens, and Reply and
 * Post about this show disabled.
 */
const PostPreviewNavigableContext = createContext(true);

interface PostPreviewNestingProviderProps {
  children: ReactNode;
  /** Mirrors `PostPreviewCard`'s `navigable`; feed previews keep the default (`true`). */
  navigable?: boolean;
}

/** Marks everything below as rendered inside an embedded post preview. */
export function PostPreviewNestingProvider({ children, navigable = true }: PostPreviewNestingProviderProps) {
  return (
    <PostPreviewNestingContext.Provider value={true}>
      <PostPreviewNavigableContext.Provider value={navigable}>{children}</PostPreviewNavigableContext.Provider>
    </PostPreviewNestingContext.Provider>
  );
}

/**
 * Sets only whether links below may navigate, without marking the subtree as an
 * embedded post preview (in-app embeds still render).
 */
export function PostPreviewNavigableProvider({ children, navigable }: { children: ReactNode; navigable: boolean }) {
  return <PostPreviewNavigableContext.Provider value={navigable}>{children}</PostPreviewNavigableContext.Provider>;
}

/** Whether the calling component is rendered inside an embedded post preview. */
export function useIsNestedPostPreview(): boolean {
  return useContext(PostPreviewNestingContext);
}

/** Whether inline links in the calling component may navigate (see `PostPreviewNavigableContext`). */
export function useIsPostPreviewNavigable(): boolean {
  return useContext(PostPreviewNavigableContext);
}
