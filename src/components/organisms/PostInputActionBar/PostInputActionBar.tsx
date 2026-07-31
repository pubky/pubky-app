'use client';

import * as React from 'react';
import { Image, Loader2, Newspaper, Send, Smile } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { cn } from '@/libs/utils/utils';
import type { PostInputActionBarProps } from './PostInputActionBar.types';

const COMMON_BUTTON_PROPS = { variant: 'secondary', size: 'sm' } as const;

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
}: PostInputActionBarProps) {
  const isMobile = useIsMobile();
  const getButtonDataCy = (ariaLabel: string) => `post-input-action-bar-${ariaLabel.toLowerCase().replace(' ', '-')}`;
  const PostButtonIconComponent = isSubmitting ? Loader2 : (postButtonIcon ?? Send);
  const postButtonAriaText = isSubmitting ? 'Posting...' : postButtonAriaLabel;
  const postButtonText = isSubmitting ? 'Posting...' : postButtonLabel;
  const postButtonIconClassName = isSubmitting ? 'animate-spin' : undefined;
  return (
    <Container className="flex w-full flex-row items-center justify-between gap-4" overrideDefaults>
      <Container className="flex items-center gap-2" overrideDefaults>
        {!isArticle ? (
          <Button
            data-cy={getButtonDataCy('Add emoji')}
            {...COMMON_BUTTON_PROPS}
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
            {...COMMON_BUTTON_PROPS}
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
            {...COMMON_BUTTON_PROPS}
            onClick={onArticleClick}
            disabled={!onArticleClick || isSubmitting}
            aria-label="Add article"
          >
            <ActionButtonContent Icon={Newspaper} />
          </Button>
        ) : null}
      </Container>
      <Container className="flex shrink-0 items-center justify-end gap-2" overrideDefaults>
        <Button
          data-cy={getButtonDataCy(postButtonAriaText)}
          {...COMMON_BUTTON_PROPS}
          onClick={onPostClick}
          disabled={isPostDisabled || !onPostClick}
          aria-label={postButtonAriaText}
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
