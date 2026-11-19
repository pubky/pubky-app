'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, Info } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { InternalLink as Link } from '@/atoms/Link/Link.navigation';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Typography } from '@/atoms/Typography/Typography';
import { FileController } from '@/controllers/file/file';
import { MessagesController } from '@/controllers/messages/messages';
import { useConversationMessages } from '@/hooks/useConversationMessages/useConversationMessages';
import { usePeerMessagingState } from '@/hooks/usePeerMessagingState/usePeerMessagingState';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { Logger } from '@/libs/logger/logger';
import { copyToClipboard, formatPublicKey, resolveUserDisplayName } from '@/libs/utils/utils';
import type { DmMessageRow } from '@/models/messages/messages.types';
import type { Pubky } from '@/models/models.types';
import { MessageBubble } from '@/molecules/MessageBubble/MessageBubble';
import { toast } from '@/molecules/Toaster/toast';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { MessageComposer } from '@/organisms/MessageComposer/MessageComposer';
import { useAuthStore } from '@/stores/auth/auth.store';

/** Pixels from the bottom within which the thread keeps following new messages. */
const STICK_TO_BOTTOM_PX = 120;

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function dayKey(timestamp: number): string {
  return new Date(timestamp * 1000).toDateString();
}

export interface ConversationThreadProps {
  peer: Pubky;
}

/** The open conversation: header, day-grouped bubbles, and the composer. */
export function ConversationThread({ peer }: ConversationThreadProps) {
  const owner = useAuthStore((state) => state.currentUserPubky);
  const { conversation, messages } = useConversationMessages(peer);
  const peerState = usePeerMessagingState(peer);
  const { userDetails } = useUserDetails(peer);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const lastCount = useRef(0);

  const name = resolveUserDisplayName(userDetails) || formatPublicKey({ key: peer, length: 10 });
  const avatarUrl = userDetails?.image ? FileController.getAvatarUrl(peer, userDetails.indexed_at) : undefined;
  const lastOwnId = [...(messages ?? [])].reverse().find((m) => m.sender === owner)?.id;

  // Register the open thread so the coordinator polls it on every tick, and create its local row.
  useEffect(() => {
    MessagesController.setActivePeer(peer);
    void MessagesController.commitOpenConversation(peer).catch((error) =>
      Logger.warn('[messages] could not open conversation', { error }),
    );
    void MessagesController.fetchConversation(peer).catch((error) =>
      Logger.warn('[messages] could not refresh conversation', { error }),
    );
    return () => MessagesController.setActivePeer(null);
  }, [peer]);

  // Reading the thread clears its unread count.
  useEffect(() => {
    if (conversation && conversation.unreadCount > 0) {
      void MessagesController.commitMarkRead(peer).catch((error) =>
        Logger.warn('[messages] could not mark read', { error }),
      );
    }
  }, [conversation, peer]);

  // Follow new messages when already at the bottom; otherwise offer a jump button.
  useEffect(() => {
    const count = messages?.length ?? 0;
    const grew = count > lastCount.current;
    lastCount.current = count;
    const element = scrollRef.current;
    if (!element || !grew) return;
    if (isAtBottom) element.scrollTo({ top: element.scrollHeight });
    else setHasNewBelow(true);
  }, [messages, isAtBottom]);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    setHasNewBelow(false);
  };

  const send = async (content: string) => {
    try {
      setIsAtBottom(true);
      await MessagesController.commitSend({ peer, content });
    } catch (error) {
      Logger.warn('[messages] send failed', { error });
      toast({ variant: 'error', description: 'Message not sent. You can retry it from the conversation.' });
    }
  };

  const retry = (message: DmMessageRow) => {
    void MessagesController.commitRetry(message.id).catch(() =>
      toast({ variant: 'error', description: 'Still could not send the message.' }),
    );
  };

  const unsend = (message: DmMessageRow) => {
    void MessagesController.commitUnsend({ peer, id: message.id }).catch(() =>
      toast({ variant: 'error', description: 'Could not unsend the message.' }),
    );
  };

  const copy = async (message: DmMessageRow) => {
    try {
      await copyToClipboard({ text: message.content });
      toast({ variant: 'info', title: 'Message copied' });
    } catch {
      toast({ variant: 'error', description: 'Could not copy to clipboard' });
    }
  };

  const cannotReceive = peerState === 'missing';

  return (
    <Container overrideDefaults className="flex h-full min-h-0 w-full flex-col" data-testid="conversation-thread">
      <Container overrideDefaults className="flex items-center gap-3 border-b border-border px-3 py-3">
        <Button asChild variant="ghost" size="icon" className="lg:hidden" aria-label="Back to messages">
          <Link href={APP_ROUTES.MESSAGES}>
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <Link href={`${APP_ROUTES.PROFILE}/${peer}`} className="flex min-w-0 items-center gap-3">
          <AvatarWithFallback avatarUrl={avatarUrl} name={name} fallbackSeed={peer} size="default" />
          <Container overrideDefaults className="flex min-w-0 flex-col">
            <Typography as="span" className="truncate font-bold">
              {name}
            </Typography>
            <Typography as="span" size="xs" className="truncate text-muted-foreground">
              {formatPublicKey({ key: peer, length: 12 })}
            </Typography>
          </Container>
        </Link>
      </Container>

      <Container
        overrideDefaults
        ref={scrollRef}
        className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
        onScroll={(event) => {
          const element = event.currentTarget;
          const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_TO_BOTTOM_PX;
          setIsAtBottom(atBottom);
          if (atBottom) setHasNewBelow(false);
        }}
      >
        {conversation?.isRequest && (
          <Container overrideDefaults className="mb-2 flex items-start gap-2 rounded-xl border border-border p-3">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <Typography size="sm" className="text-muted-foreground">
              {'Message request: you do not follow this account. Replying accepts the request.'}
            </Typography>
          </Container>
        )}
        {messages === undefined ? (
          <Container overrideDefaults className="flex flex-1 items-center justify-center">
            <Spinner />
          </Container>
        ) : messages.length === 0 ? (
          <Container overrideDefaults className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <AvatarWithFallback avatarUrl={avatarUrl} name={name} fallbackSeed={peer} size="xl" />
            <Typography className="font-bold">{name}</Typography>
            <Typography size="sm" className="max-w-sm text-muted-foreground">
              {'Messages are end-to-end encrypted. Only you and this account can read them.'}
            </Typography>
          </Container>
        ) : (
          messages.map((message, index) => {
            const previous = messages[index - 1];
            const newDay = !previous || dayKey(previous.timestamp) !== dayKey(message.timestamp);
            const isOwn = message.sender === owner;
            return (
              <Container overrideDefaults key={message.id} className="flex flex-col gap-2">
                {newDay && (
                  <Typography as="span" size="xs" className="my-2 self-center text-muted-foreground">
                    {dayFormatter.format(new Date(message.timestamp * 1000))}
                  </Typography>
                )}
                <MessageBubble
                  message={message}
                  isOwn={isOwn}
                  showStatus={isOwn && message.id === lastOwnId}
                  onRetry={() => retry(message)}
                  onUnsend={() => unsend(message)}
                  onCopy={() => void copy(message)}
                />
              </Container>
            );
          })
        )}
      </Container>

      {hasNewBelow && (
        <Container overrideDefaults className="relative">
          <Button
            variant="brand"
            size="sm"
            className="absolute -top-12 left-1/2 z-10 -translate-x-1/2 shadow-md"
            onClick={scrollToBottom}
          >
            <ArrowDown className="size-4" />
            {'New messages'}
          </Button>
        </Container>
      )}

      {cannotReceive ? (
        <Container overrideDefaults className="border-t border-border px-4 py-4 text-center">
          <Typography size="sm" className="text-muted-foreground">
            {'This account has not turned on encrypted messages yet, so it cannot receive them.'}
          </Typography>
        </Container>
      ) : (
        <MessageComposer onSend={send} />
      )}
    </Container>
  );
}
