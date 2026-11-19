'use client';

import { Mail } from 'lucide-react';
import type { ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { LAYOUT_DIMENSIONS } from '@/config/layoutDimensions';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { cn } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { ConversationList } from '@/organisms/ConversationList/ConversationList';
import { ConversationThread } from '@/organisms/ConversationThread/ConversationThread';
import { MessagesEnablePanel } from '@/organisms/MessagesEnablePanel/MessagesEnablePanel';
import { useMessagesStore } from '@/stores/messages/messages.store';

/** Space the mobile header and bottom navigation take from the viewport. */
const MOBILE_CHROME_PX = 168;

export interface MessagesProps {
  /** The open conversation, from `/messages/[pubky]`. */
  peer: Pubky | null;
  children?: ReactNode;
}

/**
 * Messages, laid out like X: the conversation list beside the open thread on desktop; on mobile the
 * list, or the thread full width with a back button.
 */
export function Messages({ peer, children }: MessagesProps) {
  const status = useMessagesStore((state) => state.status);
  const isMobile = useIsMobile();
  const offset = isMobile
    ? MOBILE_CHROME_PX
    : LAYOUT_DIMENSIONS.HEADER_OFFSET_MAIN + LAYOUT_DIMENSIONS.SIDEBAR_BOTTOM_OFFSET;

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-0"
    >
      <Container
        overrideDefaults
        data-testid="messages-page"
        className="flex w-full overflow-hidden rounded-2xl border border-border bg-card"
        style={{ height: `calc(100svh - ${offset}px)` }}
      >
        {status !== 'ready' ? (
          <MessagesEnablePanel />
        ) : (
          <>
            <Container
              overrideDefaults
              className={cn('h-full w-full shrink-0 border-border lg:flex lg:w-96 lg:border-r', peer && 'hidden')}
            >
              <ConversationList activePeer={peer} />
            </Container>
            <Container overrideDefaults className={cn('h-full min-w-0 flex-1', !peer && 'hidden lg:flex')}>
              {peer ? (
                <ConversationThread key={peer} peer={peer} />
              ) : (
                <Container
                  overrideDefaults
                  className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
                >
                  <Mail className="size-10 text-muted-foreground" />
                  <Typography className="text-2xl font-bold">{'Select a message'}</Typography>
                  <Typography className="max-w-sm text-muted-foreground">
                    {'Choose from your existing conversations, start a new one, or just keep swimming.'}
                  </Typography>
                </Container>
              )}
            </Container>
          </>
        )}
      </Container>
      {children}
    </ContentLayout>
  );
}
