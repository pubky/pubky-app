import Dexie, { type Table } from 'dexie';
import { MESSAGES_DB_NAME } from '@/config/messages';
import type { DmConversationRow, DmKeyRecordRow, DmMessageRow, DmOutboxRow } from '@/models/messages/messages.types';

/**
 * Direct messages live in their own IndexedDB database. They are account data keyed by `owner`,
 * cleared on logout, and never touch the shared database or its `DB_VERSION`.
 */
export class MessagesDatabase extends Dexie {
  conversations!: Table<DmConversationRow, [string, string]>;
  messages!: Table<DmMessageRow, [string, string]>;
  outbox!: Table<DmOutboxRow, [string, string]>;
  keyRecords!: Table<DmKeyRecordRow, [string, string]>;

  constructor(name = MESSAGES_DB_NAME) {
    super(name);
    this.version(1).stores({
      conversations: '&[owner+peer], [owner+lastMessageAt]',
      messages: '&[owner+id], [owner+peer+timestamp], [owner+peer]',
      outbox: '&[owner+id], owner',
      keyRecords: '&[owner+peer]',
    });
  }
}

export const messagesDb = new MessagesDatabase();
