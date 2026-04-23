'use client';

import { useTranslations } from 'next-intl';
import { cva } from 'class-variance-authority';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Hooks from '@/hooks';
import * as Organisms from '@/organisms';
import { PostActionsBarSkeleton } from './PostActionsBar.skeleton';
import type { PostActionsBarProps, ActionButtonConfig } from './PostActionsBar.types';

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
  const { postCounts, isLoading: isCountsLoading } = Hooks.usePostCounts(postId);
  const {
    isBookmarked,
    isLoading: isBookmarkLoading,
    isToggling: isBookmarkToggling,
    toggle: toggleBookmark,
  } = Hooks.useBookmark(postId);
  const { requireAuth } = Hooks.useRequireAuth();

  const isBookmarkBusy = isBookmarkLoading || isBookmarkToggling;
  const buttonClassName = postActionsButtonVariants({ variant });
  const countClassName = postActionsCountVariants({ variant });

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
      icon: Libs.Tag,
      count: tagCount,
      onClick: () => requireAuth(() => onTagClick?.()),
      ariaLabel: `Tag post (${tagCount})`,
    },
    {
      id: 'reply',
      icon: Libs.MessageCircle,
      count: postCounts.replies,
      onClick: () => requireAuth(() => onReplyClick?.()),
      ariaLabel: `Reply to post (${postCounts.replies})`,
    },
    {
      id: 'repost',
      icon: Libs.Repeat,
      count: postCounts.reposts,
      onClick: () => requireAuth(() => onRepostClick?.()),
      ariaLabel: `Repost (${postCounts.reposts})`,
    },
    {
      id: 'bookmark',
      icon: isBookmarkBusy ? Libs.Loader2 : Libs.Bookmark,
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
    <Atoms.Button {...commonButtonProps} aria-label="More options" data-cy="post-more-btn">
      <Libs.Ellipsis />
    </Atoms.Button>
  );

  return (
    <Atoms.Container overrideDefaults className={Libs.cn('flex flex-wrap gap-2', className)}>
      {actionButtons.map(
        ({ id, icon: Icon, count, onClick, ariaLabel, className: btnClassName, iconProps, disabled }) => (
          <Atoms.Button
            key={id}
            data-cy={`post-${id}-btn`}
            {...commonButtonProps}
            onClick={onClick}
            disabled={disabled}
            className={Libs.cn(commonButtonProps.className, btnClassName)}
            aria-label={ariaLabel}
          >
            <Icon {...iconProps} />
            {count !== undefined && (
              <Atoms.Typography as="span" overrideDefaults className={countClassName}>
                {count}
              </Atoms.Typography>
            )}
          </Atoms.Button>
        ),
      )}
      <Organisms.PostMenuActions postId={postId} trigger={moreButton} />
    </Atoms.Container>
  );
}
