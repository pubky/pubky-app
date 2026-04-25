'use client';

import * as React from 'react';
import * as Core from '@/core';
import type { TagsLayout } from './PostMain.types';

/**
 * Canonical mapping from app layout mode to post tags layout.
 * Surface entry points derive this once, then downstream post renderers inherit it.
 */
export function getTagsLayoutForSurfaceLayout(layout: Core.LayoutType): TagsLayout {
  return layout === Core.LAYOUT.WIDE ? 'side' : 'inline';
}

/**
 * Shared Tailwind class strings for the wide post layout, used by both
 * `PostMain` and `SinglePostCard` to avoid spec drift between surfaces.
 *
 * NOTE: this is an interim seam. The next pass should extract a real
 * `WidePostLayout` component once the broader post-component unification lands.
 */
export const WIDE_POST_LAYOUT_CLASSES = {
  shell: 'flex min-w-0 flex-col lg:flex-row',
  leftColumn: 'flex min-w-0 flex-col gap-4 p-12 lg:flex-1',
  rightColumn: 'hidden lg:flex lg:w-96 lg:shrink-0 lg:p-12',
  bodyText: 'text-xl leading-7',
} as const;

const PostMainLayoutContext = React.createContext<TagsLayout | undefined>(undefined);

interface PostMainLayoutProviderProps {
  tagsLayout: TagsLayout;
  children: React.ReactNode;
}

/**
 * Provides the surface-level tags layout to every PostMain rendered beneath it,
 * including those reached via the recursive ThreadTree → ReplyWithNested chain.
 */
export function PostMainLayoutProvider({ tagsLayout, children }: PostMainLayoutProviderProps) {
  return <PostMainLayoutContext.Provider value={tagsLayout}>{children}</PostMainLayoutContext.Provider>;
}

export function usePostMainLayout() {
  return React.useContext(PostMainLayoutContext);
}
