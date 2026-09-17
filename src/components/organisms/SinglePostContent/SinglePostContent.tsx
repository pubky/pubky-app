'use client';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostHeaderVisibility } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility';
import { getDisplayedPostId } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility.utils';
import { isArticleContent } from '@/libs/post/articleContent';
import { isPostDeleted } from '@/libs/utils/utils';
import { PostUnavailable } from '@/molecules/PostUnavailable/PostUnavailable';
import { PostArticleDetail } from '@/organisms/PostArticleDetail/PostArticleDetail';
import { PostMain } from '@/organisms/PostMain/PostMain';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { getTagsLayoutForSurfaceLayout } from '@/organisms/PostMain/PostMainLayoutRules';
import { useHomeStore } from '@/stores/home/home.store';
import { PostPageHeader } from '../PostPageHeader/PostPageHeader';
import { ThreadTree } from '../ThreadTree/ThreadTree';
import type { SinglePostContentProps } from './SinglePostContent.types';

/**
 * SinglePostContent Organism
 *
 * Renders a resolved single post (the parent template loads `postDetails` via `usePostDetails`).
 *
 * - Main post card (FULL WIDTH) with tags panel in two-column layout
 * - Below: two columns with Replies timeline (larger) and Participants sidebar (smaller)
 */
export function SinglePostContent({ postId, postDetails }: SinglePostContentProps) {
  const visibility = usePostHeaderVisibility(postId);
  const displayedPostId = getDisplayedPostId(postId, visibility);
  const { postDetails: originalDetails } = usePostDetails(displayedPostId !== postId ? displayedPostId : null);
  const displayedDetails = displayedPostId === postId ? postDetails : originalDetails;
  const canReply =
    !isPostDeleted(postDetails.content) && !!displayedDetails && !isPostDeleted(displayedDetails.content);
  const layout = useHomeStore((state) => state.layout);
  const tagsLayout = getTagsLayoutForSurfaceLayout(layout);

  // Check if parent post is deleted to determine replyability
  const isDeleted = isPostDeleted(postDetails.content);

  const isArticle = postDetails.kind === 'long' && isArticleContent(postDetails.content);

  return (
    <PostMainLayoutProvider tagsLayout={tagsLayout}>
      {/* Page header with breadcrumb navigation */}
      {!isArticle && <PostPageHeader postId={canReply ? displayedPostId : postId} />}

      {/* Main post - FULL WIDTH - always visible */}
      {isDeleted ? (
        <Card className="rounded-md py-0">
          <PostUnavailable message={'This post has been deleted by its author.'} />
        </Card>
      ) : isArticle ? (
        <PostArticleDetail
          postId={postId}
          content={postDetails.content}
          attachments={postDetails.attachments}
          isBlurred={postDetails.is_blurred}
        />
      ) : (
        <Container overrideDefaults data-cy="single-post-card">
          <PostMain postId={postId} pinActionsToBottom isNavigable={false} showFullContentInListLayout />
        </Container>
      )}

      {/* Replies section */}
      <Container overrideDefaults className="mb-6 flex">
        {/* Left column - Replies thread with QuickReply directly below the parent post (larger) */}
        <Container className="mb-12 w-full min-w-0 flex-1 gap-0 overflow-hidden sm:mb-0">
          {isArticle && <Typography className="text-2xl font-light text-muted-foreground">{'Replies'}</Typography>}
          <Container overrideDefaults className="ml-3">
            <ThreadTree key={displayedPostId} postId={displayedPostId} showQuickReply={canReply} />
          </Container>
        </Container>
      </Container>
    </PostMainLayoutProvider>
  );
}
