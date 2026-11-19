'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { MessagesController } from '@/controllers/messages/messages';
import type { DmConversationRow } from '@/models/messages/messages.types';
import { useAuthStore } from '@/stores/auth/auth.store';

/** The signed-in account's conversations, newest first, live from the messages database. */
export function useConversations(): DmConversationRow[] | undefined {
  const owner = useAuthStore((state) => state.currentUserPubky);
  return useLiveQuery(async () => (owner ? MessagesController.getConversations(owner) : []), [owner]);
}
