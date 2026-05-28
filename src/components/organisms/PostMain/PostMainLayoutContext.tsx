'use client';

import * as React from 'react';
import type { PostMainSurface, TagsLayout } from './PostMain.types';

export interface PostMainLayoutConfig {
  tagsLayout: TagsLayout;
  surface?: PostMainSurface;
}

const PostMainLayoutContext = React.createContext<PostMainLayoutConfig | undefined>(undefined);

interface PostMainLayoutProviderProps {
  tagsLayout: TagsLayout;
  surface?: PostMainSurface;
  children: React.ReactNode;
}

/**
 * Provides the surface-level tags layout to every PostMain rendered beneath it,
 * including those reached via the recursive ThreadTree -> ReplyWithNested chain.
 */
export function PostMainLayoutProvider({ tagsLayout, surface = 'default', children }: PostMainLayoutProviderProps) {
  return <PostMainLayoutContext.Provider value={{ tagsLayout, surface }}>{children}</PostMainLayoutContext.Provider>;
}

export function usePostMainLayout() {
  return React.useContext(PostMainLayoutContext);
}
