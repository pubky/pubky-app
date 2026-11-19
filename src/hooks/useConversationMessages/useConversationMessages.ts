'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { MessagesController } from '@/controllers/messages/messages';
import type { DmConversationRow, DmMessageRow } from '@/models/messages/messages.types';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';

export interface UseConversationMessagesResult {
  conversation: DmConversationRow | undefined;
  /** Oldest first; `undefined` while the first read is pending. */
  messages: DmMessageRow[] | undefined;
}

/** One conversation and its messages, live from the messages database. */
export function useConversationMessages(peer: Pubky): UseConversationMessagesResult {
  const owner = useAuthStore((state) => state.currentUserPubky);
  const conversation = useLiveQuery(
    async () => (owner ? MessagesController.getConversation(owner, peer) : undefined),
    [owner, peer],
  );
  const messages = useLiveQuery(async () => (owner ? MessagesController.getMessages(owner, peer) : []), [owner, peer]);
  return { conversation, messages };
}
