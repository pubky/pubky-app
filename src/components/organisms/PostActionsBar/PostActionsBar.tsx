'use client';

import { cva } from 'class-variance-authority';
import { Ellipsis, MessageCircle, Repeat, Tag } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn } from '@/libs/utils/utils';
import { PostMenuActions } from '../PostMenuActions/PostMenuActions';
import { PostSavePicker } from '../PostSavePicker/PostSavePicker';
import { PostActionsBarSkeleton } from './PostActionsBar.skeleton';
import type { ActionButtonConfig, PostActionsBarProps } from './PostActionsBar.types';

const postActionsButtonVariants = cva('', {
  variants: {
    variant: {
      default: 'border-none shadow-xs',
      visual: 'border-white/10 bg-black/40 text-white shadow-none hover:border-white/30 hover:bg-black/70',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});
const postActionsCountVariants = cva('text-xs leading-4 font-bold', {
  variants: {
    variant: {
      default: 'text-muted-foreground',
      visual: 'text-white/80',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});
export function PostActionsBar({
  postId,
  onTagClick,
  onReplyClick,
  onRepostClick,
  className,
  variant = 'default',
}: PostActionsBarProps) {
  const { postCounts, isLoading: isCountsLoading } = usePostCounts(postId);
  const { postDetails } = usePostDetails(postId);
  const { requireAuth } = useRequireAuth();
  const buttonClassName = postActionsButtonVariants({
    variant,
  });
  const countClassName = postActionsCountVariants({
    variant,
  });
  if (isCountsLoading || !postCounts) {
    return <PostActionsBarSkeleton className={className} />;
  }
  const commonButtonProps = {
    variant: 'secondary' as const,
    size: 'sm' as const,
    className: buttonClassName,
  };
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
    <Button {...commonButtonProps} aria-label="More options" data-cy="post-more-btn">
      <Ellipsis />
    </Button>
  );
  return (
    <Container overrideDefaults className={cn('flex flex-wrap gap-2', className)}>
      {actionButtons.map(
        ({ id, icon: Icon, count, onClick, ariaLabel, className: btnClassName, iconProps, disabled }) => (
          <Button
            key={id}
            data-cy={`post-${id}-btn`}
            {...commonButtonProps}
            onClick={onClick}
            disabled={disabled}
            className={cn(commonButtonProps.className, btnClassName)}
            aria-label={ariaLabel}
          >
            <Icon {...iconProps} />
            {count !== undefined && (
              <Typography as="span" overrideDefaults className={countClassName}>
                {count}
              </Typography>
            )}
          </Button>
        ),
      )}
      {!isCollection && <PostSavePicker postId={postId} buttonClassName={buttonClassName} />}
      <PostMenuActions postId={postId} trigger={moreButton} />
    </Container>
  );
}
