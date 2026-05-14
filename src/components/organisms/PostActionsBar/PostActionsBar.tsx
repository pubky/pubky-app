'use client';

import { cva } from 'class-variance-authority';
import { Bookmark, Ellipsis, Loader2, MessageCircle, Repeat, Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useBookmark } from '@/hooks/useBookmark/useBookmark';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn } from '@/libs/utils/utils';
import { PostMenuActions } from '../PostMenuActions/PostMenuActions';
import { PostActionsBarSkeleton } from './PostActionsBar.skeleton';
import type { ActionButtonConfig, PostActionsBarProps } from './PostActionsBar.types';

const postActionsButtonVariants = cva('', {
  variants: {
    variant: {
      default: 'border-none shadow-xs',
      visual: 'border-white/10 bg-black/40 text-white shadow-none hover:bg-black/55',
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
  const t = useTranslations('common');
  const { postCounts, isLoading: isCountsLoading } = usePostCounts(postId);
  const {
    isBookmarked,
    isLoading: isBookmarkLoading,
    isToggling: isBookmarkToggling,
    toggle: toggleBookmark,
  } = useBookmark(postId);
  const { requireAuth } = useRequireAuth();
  const isBookmarkBusy = isBookmarkLoading || isBookmarkToggling;
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
  const actionButtons: ActionButtonConfig[] = [
    {
      id: 'tag',
      icon: Tag,
      count: tagCount,
      onClick: () => requireAuth(() => onTagClick?.()),
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
    {
      id: 'bookmark',
      icon: isBookmarkBusy ? Loader2 : Bookmark,
      onClick: () => requireAuth(() => toggleBookmark()),
      ariaLabel: isBookmarkBusy ? t('loadingBookmark') : isBookmarked ? t('removeBookmark') : t('addBookmark'),
      className: 'w-10',
      iconProps: {
        fill: isBookmarked && !isBookmarkBusy ? 'currentColor' : 'none',
        className: isBookmarkBusy ? 'animate-spin' : undefined,
      },
      disabled: isBookmarkBusy,
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
      <PostMenuActions postId={postId} trigger={moreButton} />
    </Container>
  );
}
