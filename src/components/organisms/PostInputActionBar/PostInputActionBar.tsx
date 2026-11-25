'use client';

import * as React from 'react';
import { Expand, Image, Info, Loader2, Lock, LockOpen, Newspaper, Send, Shrink, Smile } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Switch } from '@/atoms/Switch/Switch';
import { Typography } from '@/atoms/Typography/Typography';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { cn } from '@/libs/utils/utils';
import { LocksRegionNotice } from '@/molecules/LocksRegionNotice/LocksRegionNotice';
import type { PostInputActionBarProps } from './PostInputActionBar.types';

const COMMON_BUTTON_PROPS = { variant: 'secondary', size: 'sm' } as const;
const LOCK_HELP_HEADING = 'Sell your content';
const LOCK_HELP_INFO = 'Let people pay to unlock the value you create. Add content first, then switch on the lock.';

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
  lockSwitch,
  leadingContent,
  fullscreen,
}: PostInputActionBarProps) {
  const isMobile = useIsMobile();
  const getButtonDataCy = (ariaLabel: string) => `post-input-action-bar-${ariaLabel.toLowerCase().replace(' ', '-')}`;
  const PostButtonIconComponent = isSubmitting ? Loader2 : (postButtonIcon ?? Send);
  const postButtonAriaText = isSubmitting ? 'Posting...' : postButtonAriaLabel;
  const postButtonText = isSubmitting ? 'Posting...' : postButtonLabel;
  const postButtonIconClassName = isSubmitting ? 'animate-spin' : undefined;
  return (
    <Container className="flex w-full flex-wrap items-center gap-x-2 gap-y-4" overrideDefaults>
      <Container className="flex items-center gap-2" overrideDefaults>
        {leadingContent}
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
        {!isArticle ? (
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
        {fullscreen ? (
          <Button
            data-cy="post-input-action-bar-fullscreen"
            {...COMMON_BUTTON_PROPS}
            onClick={fullscreen.onToggle}
            disabled={isSubmitting}
            aria-label={fullscreen.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-pressed={fullscreen.isFullscreen}
          >
            <ActionButtonContent Icon={fullscreen.isFullscreen ? Shrink : Expand} />
          </Button>
        ) : null}
      </Container>
      {/* `max-md:contents` puts the lock switch in the tool row on mobile; the `max-md:w-full` Post wraps below. */}
      <Container className="flex shrink-0 items-center gap-2 max-md:contents md:ml-auto" overrideDefaults>
        {/* The pill is tighter below `xsm` so it stays in the tool row of a 320px composer. */}
        {lockSwitch ? (
          <Container
            className="flex h-8 items-center gap-2 rounded-full bg-secondary px-3 shadow-xs max-xsm:gap-1.5 max-xsm:px-2"
            overrideDefaults
          >
            <ActionButtonContent Icon={lockSwitch.checked ? Lock : LockOpen} />
            <Switch
              data-cy="post-input-action-bar-lock-switch"
              checked={lockSwitch.checked}
              onCheckedChange={lockSwitch.onCheckedChange}
              disabled={isSubmitting || lockSwitch.disabled}
              aria-label="Lock content"
              className="data-[state=unchecked]:bg-accent"
            />
            {lockSwitch.regionNotice ? (
              <LocksRegionNotice variant="icon" align="end" cause={lockSwitch.regionNotice} />
            ) : null}
            {/* TODO: share this info popover with the `icon` variant of `LocksRegionNotice`, which it mirrors. */}
            {lockSwitch.showHelp && !lockSwitch.regionNotice ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground"
                    aria-label={LOCK_HELP_HEADING}
                    data-testid="lock-switch-help"
                  >
                    <Info aria-hidden />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="end"
                  sideOffset={6}
                  collisionPadding={16}
                  className="mx-0 flex flex-col gap-2 p-3"
                >
                  <Typography overrideDefaults className="text-sm font-bold text-popover-foreground">
                    {LOCK_HELP_HEADING}
                  </Typography>
                  <Typography
                    overrideDefaults
                    className="text-sm text-popover-foreground"
                    data-testid="lock-switch-help-info"
                  >
                    {LOCK_HELP_INFO}
                  </Typography>
                </PopoverContent>
              </Popover>
            ) : null}
          </Container>
        ) : null}
        <Button
          data-cy={getButtonDataCy(postButtonAriaText)}
          {...COMMON_BUTTON_PROPS}
          onClick={onPostClick}
          disabled={isSubmitting || isPostDisabled || !onPostClick}
          aria-label={postButtonAriaText}
          variant={'default'}
          size={isMobile ? 'default' : 'sm'}
          className="max-md:w-full"
        >
          <Container className="flex items-center gap-2" overrideDefaults>
            <PostButtonIconComponent className={cn('size-4 text-brand', postButtonIconClassName)} strokeWidth={2} />
            <Typography as="span" overrideDefaults>
              {postButtonText}
            </Typography>
          </Container>
        </Button>
      </Container>
    </Container>
  );
}
