'use client';

import { Ellipsis, MessageCircle, Repeat, Tag } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { HintTooltip } from '@/atoms/HintTooltip/HintTooltip';
import { Typography } from '@/atoms/Typography/Typography';
import { useLocalScopeHint, withLocalScopeHint } from '@/hooks/useLocalScopeHint/useLocalScopeHint';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn } from '@/libs/utils/utils';
import { PostMenuActions } from '../PostMenuActions/PostMenuActions';
import { PostSavePicker } from '../PostSavePicker/PostSavePicker';
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
}: PostActionsBarProps) {
  const { postCounts, isLoading: isCountsLoading } = usePostCounts(postId);
  const { postDetails } = usePostDetails(postId);
  const { requireAuth } = useRequireAuth();
  // The local index counts the tags, replies and reposts the user's network reaches
  const scopeHint = useLocalScopeHint();
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
      ariaLabel: withLocalScopeHint(`Tag post (${tagCount})`, scopeHint),
    },
    {
      id: 'reply',
      icon: MessageCircle,
      count: postCounts.replies,
      onClick: () => requireAuth(() => onReplyClick?.()),
      ariaLabel: withLocalScopeHint(`Reply to post (${postCounts.replies})`, scopeHint),
    },
    {
      id: 'repost',
      icon: Repeat,
      count: postCounts.reposts,
      onClick: () => requireAuth(() => onRepostClick?.()),
      ariaLabel: withLocalScopeHint(`Repost (${postCounts.reposts})`, scopeHint),
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
              <HintTooltip hint={scopeHint}>
                <Typography as="span" overrideDefaults className={countClassName}>
                  {count}
                </Typography>
              </HintTooltip>
            )}
          </Button>
        ),
      )}
      {!isCollection && (
        <PostSavePicker postId={savePostId} buttonClassName={buttonClassName} countClassName={countClassName} />
      )}
      <PostMenuActions postId={postId} trigger={moreButton} />
    </Container>
  );
}
