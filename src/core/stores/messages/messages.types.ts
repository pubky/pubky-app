import type { Pubky } from '@/models/models.types';

/**
 * `unknown`: not checked yet this session. `locked`: the session has no approved messaging key
 * (the Messages upgrade has not run). `ready`: the key is derived and the key record is published.
 */
export type MessagingStatus = 'unknown' | 'locked' | 'ready' | 'error';

export interface MessagesState {
  status: MessagingStatus;
  /** The conversation on screen; the coordinator checks it on every tick. */
  activePeer: Pubky | null;
}

export interface MessagesActions {
  setStatus: (status: MessagingStatus) => void;
  setActivePeer: (peer: Pubky | null) => void;
  reset: () => void;
}

export type MessagesStore = MessagesState & MessagesActions;

export const messagesInitialState: MessagesState = {
  status: 'unknown',
  activePeer: null,
};
