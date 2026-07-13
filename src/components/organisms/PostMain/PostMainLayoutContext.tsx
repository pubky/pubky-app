'use client';

import * as React from 'react';
import type { TagsLayout } from './PostMain.types';

const PostMainLayoutContext = React.createContext<TagsLayout | undefined>(undefined);

interface PostMainLayoutProviderProps {
  tagsLayout: TagsLayout;
  children: React.ReactNode;
}

/**
 * Provides the surface-level tags layout to every post renderer beneath it,
 * including PostMain, CollectionCard, QuickReply, and PostInput.
 */
export function PostMainLayoutProvider({ tagsLayout, children }: PostMainLayoutProviderProps) {
  return <PostMainLayoutContext.Provider value={tagsLayout}>{children}</PostMainLayoutContext.Provider>;
}

export function usePostMainLayout() {
  return React.useContext(PostMainLayoutContext);
}
