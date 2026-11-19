import type { Pubky } from '@/models/models.types';

/** `sending`, `sent` and `failed` are the owner's own messages; `received` came from the peer. */
export type DmMessageStatus = 'sending' | 'sent' | 'failed' | 'received';

export interface DmConversationRow {
  owner: Pubky;
  peer: Pubky;
  /** Timestamp (Unix seconds) of the latest message, or the time the conversation was opened. */
  lastMessageAt: number;
  lastMessagePreview: string;
  lastMessageFromMe: boolean;
  /** Messages from the peer newer than this (Unix seconds) are unread. */
  lastReadAt: number;
  unreadCount: number;
  /** Started by someone the owner does not follow and not yet answered. */
  isRequest: boolean;
  /** Serialized pubky-messenger `ReceiveState`, or null before the first sync. */
  receiveState: unknown;
  updatedAt: number;
}

export interface DmMessageRow {
  owner: Pubky;
  peer: Pubky;
  /** Message UUID, the file name on the sender's homeserver. */
  id: string;
  sender: Pubky;
  content: string;
  /** Unix seconds, set by the sender. */
  timestamp: number;
  /** When this device first stored the message (ms): orders messages sent within the same second. */
  seenAt: number;
  status: DmMessageStatus;
  verified: boolean;
}

export interface DmOutboxRow {
  owner: Pubky;
  peer: Pubky;
  id: string;
  /** Serialized pubky-messenger `PreparedMessage`: the same id and bytes on every retry. */
  prepared: unknown;
  createdAt: number;
  attempts: number;
}

export type DmKeyRecordState = 'enabled' | 'missing';

export interface DmKeyRecordRow {
  owner: Pubky;
  peer: Pubky;
  state: DmKeyRecordState;
  checkedAt: number;
}
