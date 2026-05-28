'use client';

import * as React from 'react';
import type { TagsLayout } from './PostMain.types';

const PostMainLayoutContext = React.createContext<TagsLayout | undefined>(undefined);

interface PostMainLayoutProviderProps {
  tagsLayout: TagsLayout;
  children: React.ReactNode;
}

/**
 * Provides the surface-level tags layout to every PostMain rendered beneath it,
 * including those reached via the recursive ThreadTree -> ReplyWithNested chain.
 */
export function PostMainLayoutProvider({ tagsLayout, children }: PostMainLayoutProviderProps) {
  return <PostMainLayoutContext.Provider value={tagsLayout}>{children}</PostMainLayoutContext.Provider>;
}

export function usePostMainLayout() {
  return React.useContext(PostMainLayoutContext);
}
