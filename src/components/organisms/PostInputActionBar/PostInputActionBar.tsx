'use client';

import * as React from 'react';
import { Image, Loader2, Newspaper, Send, Smile } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { cn } from '@/libs/utils/utils';
import type { PostInputActionBarProps } from './PostInputActionBar.types';

interface ActionButtonContentProps {
  Icon: React.ComponentType<{
    className?: string;
    strokeWidth?: number;
  }>;
  iconClassName?: string;
}
function ActionButtonContent({ Icon, iconClassName }: ActionButtonContentProps) {
  return <Icon className={cn('size-4 text-secondary-foreground', iconClassName)} strokeWidth={2} />;
}
export function PostInputActionBar({
  onEmojiClick,
  onImageClick,
  onArticleClick,
  onPostClick,
  isPostDisabled = false,
  isSubmitting = false,
  postButtonLabel = 'Post',
  postButtonAriaLabel = 'Post',
  postButtonIcon,
  hideArticleButton,
  isArticle,
  isEdit,
  characterLimit,
}: PostInputActionBarProps) {
  const isMobile = useIsMobile();
  const commonButtonProps = React.useMemo(
    () => ({
      variant: 'secondary' as const,
      size: 'sm' as const,
    }),
    [],
  );
  const getButtonDataCy = (ariaLabel: string) => `post-input-action-bar-${ariaLabel.toLowerCase().replace(' ', '-')}`;
  const PostButtonIconComponent = isSubmitting ? Loader2 : (postButtonIcon ?? Send);
  const postButtonAriaText = isSubmitting ? 'Posting...' : postButtonAriaLabel;
  const postButtonText = isSubmitting ? 'Posting...' : postButtonLabel;
  const postButtonIconClassName = isSubmitting ? 'animate-spin' : undefined;
  return (
    <Container className="flex w-full flex-col justify-between gap-4 sm:flex-row sm:items-center" overrideDefaults>
      <Container className="flex items-center gap-2" overrideDefaults>
        {!isArticle ? (
          <Button
            data-cy={getButtonDataCy('Add emoji')}
            {...commonButtonProps}
            onClick={onEmojiClick}
            disabled={!onEmojiClick || isSubmitting}
            aria-label="Add emoji"
          >
            <ActionButtonContent Icon={Smile} />
          </Button>
        ) : null}
        {!isArticle && !isEdit ? (
          <Button
            data-cy={getButtonDataCy('Add image')}
            {...commonButtonProps}
            onClick={onImageClick}
            disabled={!onImageClick || isSubmitting}
            aria-label="Add image"
          >
            <ActionButtonContent Icon={Image} />
          </Button>
        ) : null}
        {!hideArticleButton ? (
          <Button
            data-cy={getButtonDataCy('Add article')}
            {...commonButtonProps}
            onClick={onArticleClick}
            disabled={!onArticleClick || isSubmitting}
            aria-label="Add article"
          >
            <ActionButtonContent Icon={Newspaper} />
          </Button>
        ) : null}
      </Container>
      <Container className="flex items-center justify-end gap-2" overrideDefaults>
        {characterLimit ? (
          <Typography
            data-cy="post-input-action-bar-character-count"
            className="hidden shrink-0 text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground tabular-nums sm:block"
            overrideDefaults
          >
            {characterLimit.count}/{characterLimit.max}
          </Typography>
        ) : null}
        <Button
          data-cy={getButtonDataCy(postButtonAriaText)}
          {...commonButtonProps}
          onClick={onPostClick}
          disabled={isPostDisabled || !onPostClick}
          aria-label={postButtonAriaText}
          className="w-full flex-1 sm:flex-auto"
          variant={'default'}
          size={isMobile ? 'default' : 'sm'}
        >
          <Container className="flex items-center gap-2" overrideDefaults>
            <PostButtonIconComponent className={cn('size-4 text-brand', postButtonIconClassName)} strokeWidth={2} />
            <Typography as="span" size="sm" className={'text-brand'}>
              {postButtonText}
            </Typography>
          </Container>
        </Button>
      </Container>
    </Container>
  );
}
