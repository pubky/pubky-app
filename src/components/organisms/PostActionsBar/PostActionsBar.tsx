'use client';

import { Ellipsis, MessageCircle, Repeat, Tag } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn } from '@/libs/utils/utils';
import { PostMenuActions } from '../PostMenuActions/PostMenuActions';
import { PostSavePicker } from '../PostSavePicker/PostSavePicker';
import { PostActionButton } from './PostActionButton';
import { PostActionsBarSkeleton } from './PostActionsBar.skeleton';
import type { ActionButtonConfig, PostActionsBarProps } from './PostActionsBar.types';
import { postActionsButtonVariants, postActionsCountVariants } from './PostActionsBar.variants';

export function PostActionsBar({
  postId,
  savePostId = postId,
  onTagClick,
  onReplyClick,
  onRepostClick,
  className,
  variant = 'default',
  surface = 'default',
}: PostActionsBarProps) {
  const { postCounts, isLoading: isCountsLoading } = usePostCounts(postId);
  const { postDetails } = usePostDetails(postId);
  const { requireAuth } = useRequireAuth();
  const buttonClassName = postActionsButtonVariants({
    variant,
    surface,
  });
  const countClassName = postActionsCountVariants({
    variant,
  });
  if (isCountsLoading || !postCounts) {
    return <PostActionsBarSkeleton className={className} surface={surface} />;
  }
  const tagCount = postCounts.unique_tags ?? 0;
  const isCollection = postDetails?.kind === 'collection';
  const actionButtons: ActionButtonConfig[] = [
    {
      id: 'tag',
      icon: Tag,
      count: tagCount,
      onClick: () => onTagClick?.(),
      ariaLabel: `Tag post (${tagCount})`,
    },
    {
      id: 'reply',
      icon: MessageCircle,
      count: postCounts.replies,
      onClick: () => requireAuth(() => onReplyClick?.()),
      ariaLabel: `Reply to post (${postCounts.replies})`,
    },
    {
      id: 'repost',
      icon: Repeat,
      count: postCounts.reposts,
      onClick: () => requireAuth(() => onRepostClick?.()),
      ariaLabel: `Repost (${postCounts.reposts})`,
    },
  ];
  const moreButton = (
    <PostActionButton
      icon={Ellipsis}
      variant={variant}
      surface={surface}
      ariaLabel="More options"
      data-cy="post-more-btn"
    />
  );
  return (
    <Container overrideDefaults className={cn('flex flex-wrap gap-2', className)}>
      {actionButtons.map(({ id, ...action }) => (
        <PostActionButton key={id} data-cy={`post-${id}-btn`} variant={variant} surface={surface} {...action} />
      ))}
      {!isCollection && (
        <PostSavePicker postId={savePostId} buttonClassName={buttonClassName} countClassName={countClassName} />
      )}
      <PostMenuActions postId={postId} trigger={moreButton} />
    </Container>
  );
}
