'use client';

import { useState } from 'react';
import { ChevronRight, MailPlus } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Tabs, TabsList, TabsTrigger } from '@/atoms/Tabs/Tabs';
import { Typography } from '@/atoms/Typography/Typography';
import { useConversations } from '@/hooks/useConversations/useConversations';
import type { Pubky } from '@/models/models.types';
import { ConversationListItem } from '@/molecules/ConversationListItem/ConversationListItem';
import { NewMessageDialog } from '@/organisms/NewMessageDialog/NewMessageDialog';

type ConversationTab = 'all' | 'requests';

export interface ConversationListProps {
  activePeer: Pubky | null;
}

/** Left pane of Messages: title, new message, All and Requests tabs, and the conversations. */
export function ConversationList({ activePeer }: ConversationListProps) {
  const conversations = useConversations();
  const [tab, setTab] = useState<ConversationTab>('all');
  const [isComposing, setIsComposing] = useState(false);
  const requests = conversations?.filter((conversation) => conversation.isRequest) ?? [];
  const requestsUnread = requests.some((conversation) => conversation.unreadCount > 0);
  // A thread the owner opened stays listed, but empty threads they did not open never show.
  const visible = (tab === 'requests' ? requests : (conversations?.filter((c) => !c.isRequest) ?? [])).filter(
    (conversation) => conversation.lastMessagePreview !== '' || conversation.peer === activePeer,
  );

  return (
    <Container overrideDefaults className="flex h-full min-h-0 w-full flex-col" data-testid="conversation-list">
      <Container overrideDefaults className="flex items-center justify-between px-4 pt-4 pb-2">
        <Heading level={1} size="lg">
          {'Messages'}
        </Heading>
        <Button
          variant="ghost"
          size="icon"
          aria-label="New message"
          data-testid="new-message-button"
          onClick={() => setIsComposing(true)}
        >
          <MailPlus className="size-5" />
        </Button>
      </Container>
      <Tabs value={tab} onValueChange={(value) => setTab(value as ConversationTab)} className="gap-0">
        <TabsList>
          <TabsTrigger value="all">{'All'}</TabsTrigger>
          <TabsTrigger value="requests">
            {'Requests'}
            {requests.length > 0 && ` (${requests.length})`}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Container overrideDefaults className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {tab === 'all' && requests.length > 0 && (
          <button
            type="button"
            data-testid="message-requests-row"
            onClick={() => setTab('requests')}
            className="flex w-full cursor-pointer items-center gap-3 border-b border-border px-4 py-3 text-left hover:bg-secondary/60"
          >
            <Container overrideDefaults className="flex min-w-0 flex-1 flex-col">
              <Typography as="span" className="font-semibold">
                {'Message requests'}
              </Typography>
              <Typography as="span" size="sm" className="text-muted-foreground">
                {requests.length === 1 ? '1 pending request' : `${requests.length} pending requests`}
              </Typography>
            </Container>
            {requestsUnread && <span aria-label="Unread" className="size-2.5 shrink-0 rounded-full bg-brand" />}
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        )}
        {conversations === undefined ? (
          <Container overrideDefaults className="flex justify-center py-10">
            <Spinner />
          </Container>
        ) : visible.length === 0 && !(tab === 'all' && requests.length > 0) ? (
          <Container overrideDefaults className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <Typography className="text-xl font-bold">
              {tab === 'requests' ? 'No message requests' : 'Welcome to your inbox!'}
            </Typography>
            <Typography size="sm" className="text-muted-foreground">
              {tab === 'requests'
                ? 'Messages from accounts you do not follow show up here.'
                : 'Drop a line, share posts and more with private, end-to-end encrypted conversations.'}
            </Typography>
            {tab === 'all' && (
              <Button variant="brand" onClick={() => setIsComposing(true)}>
                {'Write a message'}
              </Button>
            )}
          </Container>
        ) : (
          visible.map((conversation) => (
            <ConversationListItem
              key={conversation.peer}
              conversation={conversation}
              isActive={conversation.peer === activePeer}
            />
          ))
        )}
      </Container>
      <NewMessageDialog open={isComposing} onOpenChange={setIsComposing} />
    </Container>
  );
}
