import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { messagesInitialState, type MessagesStore } from './messages.types';

/** Session-only Messages state. Conversations and messages live in the messages database. */
export const useMessagesStore = create<MessagesStore>()(
  devtools(
    (set) => ({
      ...messagesInitialState,
      setStatus: (status) => set({ status }, false, 'SET_STATUS'),
      setActivePeer: (activePeer) => set({ activePeer }, false, 'SET_ACTIVE_PEER'),
      reset: () => set(messagesInitialState, false, 'RESET'),
    }),
    { name: 'messages-store', enabled: process.env.NODE_ENV === 'development' },
  ),
);
