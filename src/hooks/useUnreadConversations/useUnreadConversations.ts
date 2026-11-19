'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { MessagesController } from '@/controllers/messages/messages';
import { useAuthStore } from '@/stores/auth/auth.store';

/** How many conversations hold unread messages, for the Messages badge. */
export function useUnreadConversations(): number {
  const owner = useAuthStore((state) => state.currentUserPubky);
  return useLiveQuery(
    async () => {
      if (!owner) return 0;
      const conversations = await MessagesController.getConversations(owner);
      return conversations.filter((conversation) => conversation.unreadCount > 0).length;
    },
    [owner],
    0,
  );
}
