import type { UsePostHeaderVisibilityResult } from './usePostHeaderVisibility.types';

/** The original is the interaction target only when the repost is flattened. */
export function getDisplayedPostId(postId: string, visibility: UsePostHeaderVisibilityResult): string {
  return visibility.showRepostHeader ? (visibility.originalPostId ?? postId) : postId;
}

/**
 * Tags and replies of a contentless repost belong to the original for every viewer, not only
 * its author; otherwise a tag written against the repost is invisible to the author's card.
 */
export function getInteractionPostId(postId: string, visibility: UsePostHeaderVisibilityResult): string {
  return visibility.isContentlessRepost ? (visibility.originalPostId ?? postId) : postId;
}
