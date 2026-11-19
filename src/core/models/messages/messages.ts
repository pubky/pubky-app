import { messagesDb } from '@/database/messages/messages.db';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { DmConversationRow, DmKeyRecordRow, DmMessageRow, DmOutboxRow } from '@/models/messages/messages.types';
import type { Pubky } from '@/models/models.types';

async function run<T>(
  operation: string,
  code: DatabaseErrorCode,
  context: Record<string, unknown>,
  task: () => Promise<T>,
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    throw Err.database(code, `Messages database ${operation} failed`, {
      service: ErrorService.Local,
      operation,
      context,
      cause: error,
    });
  }
}

/** Dexie access for direct messages. Local only: no network, no stores. */
export class MessagesModel {
  private constructor() {}

  // Conversations

  static getConversation(owner: Pubky, peer: Pubky): Promise<DmConversationRow | undefined> {
    return run('getConversation', DatabaseErrorCode.QUERY_FAILED, { peer }, () =>
      messagesDb.conversations.get([owner, peer]),
    );
  }

  /** Newest first. */
  static listConversations(owner: Pubky): Promise<DmConversationRow[]> {
    return run('listConversations', DatabaseErrorCode.QUERY_FAILED, {}, () =>
      messagesDb.conversations
        .where('[owner+lastMessageAt]')
        .between([owner, -Infinity], [owner, Infinity])
        .reverse()
        .toArray(),
    );
  }

  static putConversation(row: DmConversationRow): Promise<void> {
    return run('putConversation', DatabaseErrorCode.WRITE_FAILED, { peer: row.peer }, async () => {
      await messagesDb.conversations.put(row);
    });
  }

  static deleteConversation(owner: Pubky, peer: Pubky): Promise<void> {
    return run('deleteConversation', DatabaseErrorCode.DELETE_FAILED, { peer }, () =>
      messagesDb.transaction('rw', messagesDb.conversations, messagesDb.messages, messagesDb.outbox, async () => {
        await messagesDb.conversations.delete([owner, peer]);
        await messagesDb.messages.where('[owner+peer]').equals([owner, peer]).delete();
        await messagesDb.outbox
          .where('owner')
          .equals(owner)
          .and((row) => row.peer === peer)
          .delete();
      }),
    );
  }

  // Messages

  /** Oldest first; messages from the same second keep the order this device saw them in. */
  static listMessages(owner: Pubky, peer: Pubky): Promise<DmMessageRow[]> {
    return run('listMessages', DatabaseErrorCode.QUERY_FAILED, { peer }, async () => {
      const rows = await messagesDb.messages
        .where('[owner+peer+timestamp]')
        .between([owner, peer, -Infinity], [owner, peer, Infinity])
        .toArray();
      return rows.sort((a, b) => a.timestamp - b.timestamp || a.seenAt - b.seenAt);
    });
  }

  static getMessage(owner: Pubky, id: string): Promise<DmMessageRow | undefined> {
    return run('getMessage', DatabaseErrorCode.QUERY_FAILED, { id }, () => messagesDb.messages.get([owner, id]));
  }

  static putMessages(rows: DmMessageRow[]): Promise<void> {
    return run('putMessages', DatabaseErrorCode.WRITE_FAILED, { count: rows.length }, async () => {
      await messagesDb.messages.bulkPut(rows);
    });
  }

  static deleteMessage(owner: Pubky, id: string): Promise<void> {
    return run('deleteMessage', DatabaseErrorCode.DELETE_FAILED, { id }, () =>
      messagesDb.transaction('rw', messagesDb.messages, messagesDb.outbox, async () => {
        await messagesDb.messages.delete([owner, id]);
        await messagesDb.outbox.delete([owner, id]);
      }),
    );
  }

  // Outbox

  static getOutbox(owner: Pubky, id: string): Promise<DmOutboxRow | undefined> {
    return run('getOutbox', DatabaseErrorCode.QUERY_FAILED, { id }, () => messagesDb.outbox.get([owner, id]));
  }

  static listOutbox(owner: Pubky): Promise<DmOutboxRow[]> {
    return run('listOutbox', DatabaseErrorCode.QUERY_FAILED, {}, () =>
      messagesDb.outbox.where('owner').equals(owner).toArray(),
    );
  }

  /** Records a sending message and its prepared publication together, so a crash cannot split them. */
  static putPendingMessage(message: DmMessageRow, outbox: DmOutboxRow): Promise<void> {
    return run('putPendingMessage', DatabaseErrorCode.WRITE_FAILED, { id: message.id }, () =>
      messagesDb.transaction('rw', messagesDb.messages, messagesDb.outbox, async () => {
        await messagesDb.messages.put(message);
        await messagesDb.outbox.put(outbox);
      }),
    );
  }

  static putOutbox(row: DmOutboxRow): Promise<void> {
    return run('putOutbox', DatabaseErrorCode.WRITE_FAILED, { id: row.id }, async () => {
      await messagesDb.outbox.put(row);
    });
  }

  /** Marks a published message sent and drops its outbox entry in one transaction. */
  static completeOutbox(owner: Pubky, id: string): Promise<void> {
    return run('completeOutbox', DatabaseErrorCode.WRITE_FAILED, { id }, () =>
      messagesDb.transaction('rw', messagesDb.messages, messagesDb.outbox, async () => {
        await messagesDb.messages.update([owner, id], { status: 'sent' });
        await messagesDb.outbox.delete([owner, id]);
      }),
    );
  }

  static setMessageStatus(owner: Pubky, id: string, status: DmMessageRow['status']): Promise<void> {
    return run('setMessageStatus', DatabaseErrorCode.WRITE_FAILED, { id }, async () => {
      await messagesDb.messages.update([owner, id], { status });
    });
  }

  // Key records

  static getKeyRecord(owner: Pubky, peer: Pubky): Promise<DmKeyRecordRow | undefined> {
    return run('getKeyRecord', DatabaseErrorCode.QUERY_FAILED, { peer }, () =>
      messagesDb.keyRecords.get([owner, peer]),
    );
  }

  static putKeyRecords(rows: DmKeyRecordRow[]): Promise<void> {
    return run('putKeyRecords', DatabaseErrorCode.WRITE_FAILED, { count: rows.length }, async () => {
      await messagesDb.keyRecords.bulkPut(rows);
    });
  }

  /** Logout: removes every account's messages from this device. */
  static clearAll(): Promise<void> {
    return run('clearAll', DatabaseErrorCode.DELETE_FAILED, {}, () =>
      messagesDb.transaction(
        'rw',
        [messagesDb.conversations, messagesDb.messages, messagesDb.outbox, messagesDb.keyRecords],
        async () => {
          await Promise.all([
            messagesDb.conversations.clear(),
            messagesDb.messages.clear(),
            messagesDb.outbox.clear(),
            messagesDb.keyRecords.clear(),
          ]);
        },
      ),
    );
  }
}
