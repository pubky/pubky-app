'use client';

import { AlertCircle, Copy, MoreHorizontal, RotateCw, ShieldAlert, Undo2 } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/atoms/DropdownMenu/DropdownMenu';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import type { DmMessageRow } from '@/models/messages/messages.types';

export interface MessageBubbleProps {
  message: DmMessageRow;
  isOwn: boolean;
  /** Show the delivery state under this bubble (the owner's latest message, or any failed one). */
  showStatus: boolean;
  onRetry: () => void;
  onUnsend: () => void;
  onCopy: () => void;
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** A chat bubble: the owner's on the right in the brand color, the peer's on the left. */
export function MessageBubble({ message, isOwn, showStatus, onRetry, onUnsend, onCopy }: MessageBubbleProps) {
  const sentAt = new Date(message.timestamp * 1000);
  const failed = message.status === 'failed';

  return (
    <Container
      overrideDefaults
      data-testid="message-bubble"
      className={cn('group flex w-full flex-col gap-1', isOwn ? 'items-end' : 'items-start')}
    >
      <Container overrideDefaults className={cn('flex max-w-[85%] items-center gap-1', isOwn && 'flex-row-reverse')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Container
              overrideDefaults
              className={cn(
                'rounded-3xl px-4 py-2.5 break-words whitespace-pre-wrap',
                isOwn ? 'rounded-br-md bg-brand text-brand-foreground' : 'rounded-bl-md bg-secondary text-foreground',
                message.status === 'sending' && 'opacity-70',
                failed && 'opacity-60',
              )}
            >
              <Typography as="span" overrideDefaults className="text-base wrap-anywhere">
                {message.content}
              </Typography>
            </Container>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent className="pointer-coarse:hidden">{sentAt.toLocaleString()}</TooltipContent>
          </TooltipPortal>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Message actions"
              className="size-8 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isOwn ? 'end' : 'start'}>
            <DropdownMenuItem onSelect={onCopy}>
              <Copy className="size-4" />
              {'Copy message'}
            </DropdownMenuItem>
            {isOwn && (
              <DropdownMenuItem onSelect={onUnsend} className="text-destructive">
                <Undo2 className="size-4" />
                {'Unsend'}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </Container>
      {!message.verified && (
        <Typography as="span" size="xs" className="flex items-center gap-1 text-destructive">
          <ShieldAlert className="size-3" />
          {'Unverified: the signature did not check out'}
        </Typography>
      )}
      {failed ? (
        <Button variant="link" size="sm" onClick={onRetry} className="h-auto gap-1 px-1 text-destructive">
          <AlertCircle className="size-3" />
          {'Failed to send. Tap to retry'}
          <RotateCw className="size-3" />
        </Button>
      ) : (
        showStatus && (
          <Typography as="span" size="xs" className="px-1 text-muted-foreground">
            {message.status === 'sending' ? 'Sending...' : `${timeFormatter.format(sentAt)}${isOwn ? ' · Sent' : ''}`}
          </Typography>
        )
      )}
    </Container>
  );
}
