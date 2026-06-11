'use client';

import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { isValidPostCompositeId } from '@/libs/utils/utils';
import type { UsePostMissingResult } from './usePostMissing.types';

/**
 * Tells whether a post exists. Shared by the post page shell and body so they
 * never disagree.
 *
 * `postMissing` is true when the composite id is malformed (no fetch attempted)
 * or the fetch finished without finding the post.
 */
export function usePostMissing(postId: string): UsePostMissingResult {
  const compositeValid = isValidPostCompositeId(postId);
  const { postDetails, isLoading } = usePostDetails(postId, { enabled: compositeValid });

  return {
    postMissing: !compositeValid || (!isLoading && postDetails === null),
    postDetails,
    isLoading,
  };
}
