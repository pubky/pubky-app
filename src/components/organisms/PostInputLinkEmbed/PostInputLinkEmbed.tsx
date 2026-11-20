'use client';

import { ArrowLeftRight, Check, ChevronDown, Link, X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/atoms/DropdownMenu/DropdownMenu';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { PostLinkEmbeds } from '@/molecules/PostLinkEmbeds/PostLinkEmbeds';
import { PostPreviewNavigableProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import type { PostInputLinkEmbedProps } from './PostInputLinkEmbed.types';

/** A link as the label and the Switch menu name it: without its scheme. */
const toLinkLabel = (url: string) => url.replace(/^https?:\/\//, '');

/**
 * The link a new post embeds, shown in the composer as the post will show it: the same external
 * resource card (or the link's own preview) in the same frame, with its footer: the resource can be
 * tagged and saved before the post is sent, while Reply and Post about this, which would open another
 * composer, show disabled. A line above it names the link and holds the button that
 * removes the embed; on the card's corner that button would cover the card's source. The card must
 * not navigate away from the post being written. While the text holds several links that can be
 * embedded, the line also holds a Switch menu listing them, the embedded one checked: a post embeds
 * one link, and the menu swaps which one.
 *
 * Once removed, the composer shows the plain website preview readers get from the text (no resource
 * card, since the post no longer references the resource), under a line that says the link is not
 * embedded and offers to embed it again.
 */
export function PostInputLinkEmbed(props: PostInputLinkEmbedProps) {
  const disabled = props.disabled ?? false;

  if (props.isRemoved) {
    return (
      <Container
        overrideDefaults
        data-testid="post-input-link-embed-removed"
        className="flex min-w-0 items-center justify-between gap-2"
      >
        <Typography size="sm" className="min-w-0 truncate text-muted-foreground">
          Link not embedded
        </Typography>
        <Button
          variant="ghost"
          size="sm"
          onClick={props.onRestore}
          disabled={disabled}
          data-cy="post-input-link-embed-restore"
          className="shrink-0"
        >
          Embed again
        </Button>
      </Container>
    );
  }

  const { url, onRemove, choices, onPick } = props;
  const switchChoices = choices && choices.length > 1 ? choices : null;

  return (
    <Container
      overrideDefaults
      data-testid="post-input-link-embed"
      role="group"
      aria-label="Embedded link"
      className="flex w-full max-w-full min-w-0 flex-col gap-1"
    >
      <Container overrideDefaults className="flex min-w-0 items-center justify-between gap-2">
        {/* The link names the embed even when its preview renders nothing */}
        <Typography size="sm" className="min-w-0 truncate text-muted-foreground" title={url}>
          Embedded link · {toLinkLabel(url)}
        </Typography>
        {switchChoices && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                aria-label="Switch the embedded link (a post embeds one)"
                data-cy="post-input-link-embed-switch"
                className="ml-auto shrink-0 border-foreground/30 bg-background text-foreground hover:border-foreground/50 hover:bg-background/60 data-[state=open]:border-foreground/50"
              >
                <ArrowLeftRight className="size-4" />
                <Typography as="span" overrideDefaults className="hidden sm:inline">
                  Switch
                </Typography>
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="flex w-56 flex-col gap-2.5"
              data-testid="post-input-link-embed-switch-menu"
            >
              {switchChoices.map((choice) => {
                const isEmbedded = choice === url;
                return (
                  <DropdownMenuItem
                    key={choice}
                    onSelect={() => onPick?.(choice)}
                    title={choice}
                    aria-label={isEmbedded ? `${toLinkLabel(choice)} (embedded)` : `Embed ${toLinkLabel(choice)}`}
                    data-cy="post-input-link-embed-switch-item"
                    className="group gap-2 p-0"
                  >
                    <Link
                      className={cn(
                        'size-4 shrink-0 transition-colors group-hover:text-foreground',
                        isEmbedded ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    />
                    <Typography
                      as="span"
                      overrideDefaults
                      className={cn(
                        'min-w-0 flex-1 truncate text-base font-medium transition-colors group-hover:text-foreground',
                        isEmbedded ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {toLinkLabel(choice)}
                    </Typography>
                    {isEmbedded && <Check aria-hidden="true" className="size-4 shrink-0 text-brand" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove embedded link"
          data-cy="post-input-link-embed-remove"
          className="size-8 shrink-0"
        >
          <X className="size-4" />
        </Button>
      </Container>
      <PostPreviewNavigableProvider navigable={false}>
        <PostLinkEmbeds url={url} isComposing />
      </PostPreviewNavigableProvider>
    </Container>
  );
}
