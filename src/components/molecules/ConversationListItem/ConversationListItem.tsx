'use client';

import { getMessagesRoute } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { InternalLink as Link } from '@/atoms/Link/Link.navigation';
import { Typography } from '@/atoms/Typography/Typography';
import { FileController } from '@/controllers/file/file';
import { useRelativeTime } from '@/hooks/useRelativeTime/useRelativeTime';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { cn, formatPublicKey, resolveUserDisplayName } from '@/libs/utils/utils';
import type { DmConversationRow } from '@/models/messages/messages.types';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';

export interface ConversationListItemProps {
  conversation: DmConversationRow;
  isActive: boolean;
}

/** One row of the conversation list: who, the latest message, when, and whether it is unread. */
export function ConversationListItem({ conversation, isActive }: ConversationListItemProps) {
  const { userDetails } = useUserDetails(conversation.peer);
  const { formatRelativeTime } = useRelativeTime();
  const name = resolveUserDisplayName(userDetails) || formatPublicKey({ key: conversation.peer, length: 10 });
  const avatarUrl = userDetails?.image
    ? FileController.getAvatarUrl(conversation.peer, userDetails.indexed_at)
    : undefined;
  const unread = conversation.unreadCount > 0;
  const preview = conversation.lastMessagePreview
    ? `${conversation.lastMessageFromMe ? 'You: ' : ''}${conversation.lastMessagePreview}`
    : 'No messages yet';

  return (
    <Link
      href={getMessagesRoute(conversation.peer)}
      data-testid="conversation-list-item"
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/60',
        isActive && 'bg-secondary',
      )}
    >
      <AvatarWithFallback avatarUrl={avatarUrl} name={name} fallbackSeed={conversation.peer} size="lg" />
      <Container overrideDefaults className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Container overrideDefaults className="flex min-w-0 items-baseline gap-1">
          <Typography as="span" className={cn('truncate', unread ? 'font-bold' : 'font-semibold')}>
            {name}
          </Typography>
          <Typography as="span" size="sm" className="shrink-0 text-muted-foreground">
            {formatPublicKey({ key: conversation.peer, length: 8 })}
          </Typography>
          <Typography as="span" size="sm" className="shrink-0 text-muted-foreground">
            {'· '}
            {formatRelativeTime(new Date(conversation.lastMessageAt * 1000))}
          </Typography>
        </Container>
        <Typography
          as="span"
          size="sm"
          className={cn('truncate', unread ? 'font-semibold text-foreground' : 'text-muted-foreground')}
        >
          {preview}
        </Typography>
      </Container>
      {unread && (
        <span
          data-testid="conversation-unread-dot"
          aria-label="Unread"
          className="size-2.5 shrink-0 rounded-full bg-brand"
        />
      )}
    </Link>
  );
}
