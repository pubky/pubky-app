'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import { SinglePostArticle } from '../SinglePostArticle';
import { SinglePostCard } from '../SinglePostCard';
import { SinglePostParticipants } from '../SinglePostParticipants';
import { QuickReply } from '../QuickReply';
import { PostMain } from '../PostMain';
import { PostPageHeader } from '../PostPageHeader';
import type { SinglePostContentProps } from './SinglePostContent.types';

/**
 * SinglePostContent Organism
 *
 * Contains all the business logic and hooks for displaying a single post page:
 * - Main post card (FULL WIDTH) with tags panel in two-column layout
 * - Below: Two columns with Replies timeline (larger) and Participants sidebar (smaller)
 *
 * For unauthenticated users (following pubky-app pattern):
 * - Only the main post card with tags is shown
 * - QuickReply, Replies, and Participants are hidden
 *
 * This organism handles all data fetching and state management,
 * following the atomic design pattern where only organisms can call hooks.
 */
export function SinglePostContent({ postId }: SinglePostContentProps) {
  const t = useTranslations('common');

  // Check authentication status - unauthenticated users see limited view
  const { isAuthenticated } = Hooks.useRequireAuth();

  // Use the dedicated hook for fetching replies (only fetch if authenticated)
  const { replyIds, loading, loadingMore, error, hasMore, loadMore, prependReply } = Hooks.usePostReplies(
    isAuthenticated ? postId : null,
  );

  const { navigateToPost } = Hooks.usePostNavigation();

  // Check if parent post is deleted to determine replyability
  const { postDetails } = Hooks.usePostDetails(postId);
  const isDeleted = Libs.isPostDeleted(postDetails?.content);

  // Infinite scroll hook (only active if authenticated)
  const { sentinelRef } = Hooks.useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore: isAuthenticated && hasMore,
    isLoading: loadingMore,
    threshold: 3000,
    debounceMs: 20,
  });

  // TODO - Add loading skeleton
  if (!postDetails) return t('loadingPost');

  const isArticle = postDetails.kind === 'long';

  return (
    <>
      {/* Page header with breadcrumb navigation */}
      <PostPageHeader postId={postId} />

      {/* Main post - FULL WIDTH - always visible */}
      {isDeleted ? (
        <Atoms.Card className="rounded-md py-0">
          <Molecules.PostDeleted />
        </Atoms.Card>
      ) : isArticle ? (
        <SinglePostArticle
          postId={postId}
          content={postDetails.content}
          attachments={postDetails.attachments}
          isBlurred={postDetails.is_blurred}
        />
      ) : (
        <SinglePostCard postId={postId} />
      )}

      {/* Replies section - only visible for authenticated users */}
      {isAuthenticated && (
        <Atoms.Container overrideDefaults className="flex gap-6">
          {/* Left column - QuickReply and Replies thread connected to main post (larger) */}
          <Atoms.Container className="w-full min-w-0 flex-1 gap-0 overflow-hidden">
            {/* QuickReply directly under main post (if parent not deleted) */}
            {!isDeleted && (
              <Atoms.Container overrideDefaults className="ml-3">
                <Atoms.PostThreadSpacer />
                <QuickReply
                  parentPostId={postId}
                  connectorVariant={
                    replyIds.length > 0 || (hasMore && !loading)
                      ? Atoms.POST_THREAD_CONNECTOR_VARIANTS.REGULAR
                      : Atoms.POST_THREAD_CONNECTOR_VARIANTS.LAST
                  }
                  onReplySubmitted={prependReply}
                />
              </Atoms.Container>
            )}

            {/* Initial loading state */}
            {loading && (
              <Atoms.Container className="flex items-center justify-center gap-3 py-8">
                <Atoms.Spinner size="md" />
                <Atoms.Typography as="p" className="text-muted-foreground">
                  {t('loadingReplies')}
                </Atoms.Typography>
              </Atoms.Container>
            )}

            {/* Error state */}
            {error && !loading && <Molecules.TimelineError message={error} />}

            {/* Replies list with thread connectors (after QuickReply) */}
            {!loading && replyIds.length > 0 && (
              <Atoms.Container overrideDefaults className="ml-3">
                {replyIds.map((replyId, index) => (
                  <Atoms.Container key={`reply_${replyId}`} overrideDefaults>
                    <Atoms.PostThreadSpacer />
                    <PostMain
                      postId={replyId}
                      isReply={true}
                      onClick={() => navigateToPost(replyId)}
                      isLastReply={index === replyIds.length - 1 && !hasMore}
                      tagsLayout="side"
                    />
                  </Atoms.Container>
                ))}

                {/* Loading more indicator */}
                {loadingMore && <Molecules.TimelineLoadingMore />}

                {/* Sentinel for infinite scroll */}
                <div ref={sentinelRef} className="h-1" />

                {/* End of replies message */}
                {!hasMore && replyIds.length > 0 && <Molecules.TimelineEndMessage />}
              </Atoms.Container>
            )}
          </Atoms.Container>

          {/* Right column - Participants sidebar (desktop only) */}
          <Atoms.Container
            overrideDefaults
            className={Libs.cn(
              'sticky hidden flex-col items-start justify-start gap-6 self-start pt-6 lg:flex',
              'top-[147px]',
              'w-full max-w-xs',
            )}
          >
            <SinglePostParticipants postId={postId} />
          </Atoms.Container>
        </Atoms.Container>
      )}
    </>
  );
}
