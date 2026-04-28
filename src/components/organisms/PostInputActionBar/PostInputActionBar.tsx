'use client';

import * as React from 'react';
import * as Atoms from '@/atoms';
import type { PostInputActionBarProps } from './PostInputActionBar.types';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { Loader2, Send, Smile, Image, Newspaper } from 'lucide-react';
import { cn } from '@/libs/utils/utils';

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
    <Atoms.Container className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center" overrideDefaults>
      <Atoms.Container className="flex items-center gap-2" overrideDefaults>
        {!isArticle ? (
          <Atoms.Button
            data-cy={getButtonDataCy('Add emoji')}
            {...commonButtonProps}
            onClick={onEmojiClick}
            disabled={!onEmojiClick || isSubmitting}
            aria-label="Add emoji"
          >
            <ActionButtonContent Icon={Smile} />
          </Atoms.Button>
        ) : null}
        {!isArticle && !isEdit ? (
          <Atoms.Button
            data-cy={getButtonDataCy('Add image')}
            {...commonButtonProps}
            onClick={onImageClick}
            disabled={!onImageClick || isSubmitting}
            aria-label="Add image"
          >
            <ActionButtonContent Icon={Image} />
          </Atoms.Button>
        ) : null}
        {!hideArticleButton ? (
          <Atoms.Button
            data-cy={getButtonDataCy('Add article')}
            {...commonButtonProps}
            onClick={onArticleClick}
            disabled={!onArticleClick || isSubmitting}
            aria-label="Add article"
          >
            <ActionButtonContent Icon={Newspaper} />
          </Atoms.Button>
        ) : null}
      </Atoms.Container>
      <Atoms.Container className="flex items-center justify-end gap-2" overrideDefaults>
        {characterLimit ? (
          <Atoms.Typography
            data-cy="post-input-action-bar-character-count"
            className="hidden shrink-0 text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground tabular-nums sm:block"
            overrideDefaults
          >
            {characterLimit.count}/{characterLimit.max}
          </Atoms.Typography>
        ) : null}
        <Atoms.Button
          data-cy={getButtonDataCy(postButtonAriaText)}
          {...commonButtonProps}
          onClick={onPostClick}
          disabled={isPostDisabled || !onPostClick}
          aria-label={postButtonAriaText}
          className="w-full flex-1 sm:flex-auto"
          variant={'default'}
          size={isMobile ? 'default' : 'sm'}
        >
          <Atoms.Container className="flex items-center gap-2" overrideDefaults>
            <PostButtonIconComponent className={cn('size-4 text-brand', postButtonIconClassName)} strokeWidth={2} />
            <Atoms.Typography as="span" size="sm" className={'text-brand'}>
              {postButtonText}
            </Atoms.Typography>
          </Atoms.Container>
        </Atoms.Button>
      </Atoms.Container>
    </Atoms.Container>
  );
}
