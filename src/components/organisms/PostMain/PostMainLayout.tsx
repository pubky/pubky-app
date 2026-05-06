'use client';

import * as React from 'react';
import { LAYOUT, type LayoutType } from '@/stores/home/home.types';
import type { TagsLayout } from './PostMain.types';

export const WIDE_POST_BODY_TEXT_CLASS = 'text-xl leading-7';

/**
 * Canonical mapping from app layout mode to post tags layout.
 * Surface entry points derive this once, then downstream post renderers inherit it.
 */
export function getTagsLayoutForSurfaceLayout(layout: LayoutType): TagsLayout {
  return layout === LAYOUT.WIDE ? 'side' : 'inline';
}

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
