'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { isArticleContent } from '@/libs/post/articleContent';
import { isPostDeleted } from '@/libs/utils/utils';
import { PostDeleted } from '@/molecules/PostDeleted/PostDeleted';
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
  const t = useTranslations('post');
  const layout = useHomeStore((state) => state.layout);
  const tagsLayout = getTagsLayoutForSurfaceLayout(layout);

  // Check if parent post is deleted to determine replyability
  const isDeleted = isPostDeleted(postDetails.content);

  const isArticle = postDetails.kind === 'long' && isArticleContent(postDetails.content);

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
          <PostMain postId={postId} pinActionsToBottom isNavigable={false} showFullContentInListLayout />
        </Container>
      )}

      {/* Replies section */}
      <Container overrideDefaults className="mb-6 flex">
        {/* Left column - Replies thread with QuickReply at the end (larger) */}
        <Container className="mb-12 w-full min-w-0 flex-1 gap-0 overflow-hidden sm:mb-0">
          {isArticle && <Typography className="text-2xl font-light text-muted-foreground">{t('replies')}</Typography>}
          <Container overrideDefaults className="ml-3">
            <ThreadTree key={postId} postId={postId} showQuickReply={!isDeleted} />
          </Container>
        </Container>
      </Container>
    </PostMainLayoutProvider>
  );
}
