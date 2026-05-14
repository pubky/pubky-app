'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { isPostDeleted } from '@/libs/utils/utils';
import { PostDeleted } from '@/molecules/PostDeleted/PostDeleted';
import { PostArticleDetail } from '@/organisms/PostArticleDetail/PostArticleDetail';
import { PostMain } from '@/organisms/PostMain/PostMain';
import { PostMainLayoutProvider } from '@/organisms/PostMain/PostMainLayoutContext';
import { getTagsLayoutForSurfaceLayout } from '@/organisms/PostMain/PostMainLayoutRules';
import { useHomeStore } from '@/stores/home/home.store';
import { PostPageHeader } from '../PostPageHeader/PostPageHeader';
import { ThreadTree } from '../ThreadTree/ThreadTree';
import { SinglePostContentSkeleton } from './SinglePostContent.skeleton';
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
  const t = useTranslations('post');
  const layout = useHomeStore((state) => state.layout);
  const tagsLayout = getTagsLayoutForSurfaceLayout(layout);

  // Check authentication status - unauthenticated users see limited view
  const { isAuthenticated } = useRequireAuth();

  // Check if parent post is deleted to determine replyability
  const { postDetails } = usePostDetails(postId);
  const isDeleted = isPostDeleted(postDetails?.content);

  if (!postDetails) {
    return <SinglePostContentSkeleton />;
  }

  const isArticle = postDetails.kind === 'long';

  return (
    <PostMainLayoutProvider tagsLayout={tagsLayout}>
      {/* Page header with breadcrumb navigation */}
      <PostPageHeader postId={postId} />

      {/* Main post - FULL WIDTH - always visible */}
      {isDeleted ? (
        <Card className="rounded-md py-0">
          <PostDeleted />
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
          <PostMain postId={postId} pinActionsToBottom isNavigable={false} />
        </Container>
      )}

      {/* Replies section - only visible for authenticated users */}
      {isAuthenticated && (
        <Container overrideDefaults className="mb-6 flex">
          {/* Left column - Replies thread with QuickReply at the end (larger) */}
          <Container className="mb-12 w-full min-w-0 flex-1 gap-0 overflow-hidden sm:mb-0">
            {isArticle && <Typography className="text-2xl font-light text-muted-foreground">{t('replies')}</Typography>}
            <Container overrideDefaults className="ml-3">
              <ThreadTree key={postId} postId={postId} showQuickReply={!isDeleted} />
            </Container>
          </Container>
        </Container>
      )}
    </PostMainLayoutProvider>
  );
}
