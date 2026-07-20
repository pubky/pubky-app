'use client';

import { Image, Loader2, MessageCircle, Smile } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import type { CharacterLimit } from '@/organisms/PostInputActionBar/PostInputActionBar.types';

interface QuickReplyListActionsProps {
  onEmojiClick: () => void;
  onImageClick: () => void;
  onSubmit: () => void | Promise<void>;
  isPostDisabled: boolean;
  isSubmitting: boolean;
  characterLimit: CharacterLimit;
  submitLabel: string;
}

/** Compact inline action cluster shown at the end of the composer row in list layout. */
export function QuickReplyListActions({
  onEmojiClick,
  onImageClick,
  onSubmit,
  isPostDisabled,
  isSubmitting,
  characterLimit,
  submitLabel,
}: QuickReplyListActionsProps) {
  const SubmitIcon = isSubmitting ? Loader2 : MessageCircle;
  const submitText = isSubmitting ? 'Posting...' : submitLabel;

  return (
    <Container
      className="flex shrink-0 items-center justify-start gap-2 self-start"
      overrideDefaults
      data-testid="quick-reply-list-actions"
      onClick={(event) => event.stopPropagation()}
    >
      <Typography
        data-cy="post-input-action-bar-character-count"
        className="shrink-0 text-xs leading-4 font-medium tracking-[0.075rem] whitespace-nowrap text-muted-foreground tabular-nums"
        overrideDefaults
      >
        {characterLimit.count}/{characterLimit.max}
      </Typography>

      <Button
        variant="secondary"
        size="sm"
        onClick={onEmojiClick}
        disabled={isSubmitting}
        aria-label="Add emoji"
        data-cy="post-input-action-bar-add-emoji"
      >
        <Smile className="size-4 text-secondary-foreground" strokeWidth={2} />
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={onImageClick}
        disabled={isSubmitting}
        aria-label="Add image"
        data-cy="post-input-action-bar-add-image"
      >
        <Image className="size-4 text-secondary-foreground" strokeWidth={2} />
      </Button>

      <Button
        variant="default"
        size="sm"
        onClick={onSubmit}
        disabled={isPostDisabled}
        aria-label={submitText}
        data-cy={`post-input-action-bar-${submitText.toLowerCase().replace(' ', '-')}`}
      >
        <Container className="flex items-center gap-2" overrideDefaults>
          <SubmitIcon className={cn('size-4 text-brand', isSubmitting && 'animate-spin')} strokeWidth={2} />
          <Typography as="span" size="sm" className="text-brand">
            {submitText}
          </Typography>
        </Container>
      </Button>
    </Container>
  );
}
