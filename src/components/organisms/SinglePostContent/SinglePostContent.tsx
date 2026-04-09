'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import { SinglePostArticle } from '../SinglePostArticle';
import { SinglePostCard } from '../SinglePostCard';

import { PostPageHeader } from '../PostPageHeader';
import { ThreadTree } from '../ThreadTree/ThreadTree';
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

  // Check if parent post is deleted to determine replyability
  const { postDetails } = Hooks.usePostDetails(postId);
  const isDeleted = Libs.isPostDeleted(postDetails?.content);

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
        <Atoms.Container overrideDefaults className="mb-6 flex">
          {/* Left column - Replies thread with QuickReply at the end (larger) */}
          <Atoms.Container className="w-full min-w-0 flex-1 gap-0 overflow-hidden">
            <Atoms.Container overrideDefaults className="ml-3">
              <ThreadTree key={postId} postId={postId} showQuickReply={!isDeleted} />
            </Atoms.Container>
          </Atoms.Container>
        </Atoms.Container>
      )}
    </>
  );
}
