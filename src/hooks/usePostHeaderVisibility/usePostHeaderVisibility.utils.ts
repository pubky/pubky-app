import type { UsePostHeaderVisibilityResult } from './usePostHeaderVisibility.types';

/** The original is the interaction target only when the repost is flattened. */
export function getDisplayedPostId(postId: string, visibility: UsePostHeaderVisibilityResult): string {
  return visibility.showRepostHeader ? (visibility.originalPostId ?? postId) : postId;
}
