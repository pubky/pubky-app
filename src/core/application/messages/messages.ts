import { messageUuid, PreparedMessage, ReceiveState } from 'pubky-messenger-ts';
import {
  MESSAGES_CANDIDATES_TTL_MS,
  MESSAGES_DISCOVERY_MAX_PEERS,
  MESSAGES_KEY_RECORD_TTL_MS,
} from '@/config/messages';
import { NEXUS_USER_STREAM_MAX_LIMIT } from '@/config/nexus';
import { AuthErrorCode, NetworkErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { MessagesModel } from '@/models/messages/messages';
import type { DmConversationRow, DmKeyRecordState, DmMessageRow } from '@/models/messages/messages.types';
import type { Pubky } from '@/models/models.types';
import { MessagesService, type MessagingClient } from '@/services/messages/messages';
import { UserStreamReach } from '@/services/nexus/nexus.types';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';

/** Peer readiness for the Message button: `unknown` while the owner's own key is not set up. */
export type PeerMessagingState = DmKeyRecordState | 'unknown';

const nowSeconds = () => Math.floor(Date.now() / 1000);

let cachedClient: MessagingClient | null = null;
let cachedCandidates: { owner: Pubky; following: Set<Pubky>; peers: Pubky[]; fetchedAt: number } | null = null;

/** `incoming` threads start unread from their first message; threads the owner opens start read. */
function emptyConversation(owner: Pubky, peer: Pubky, isRequest: boolean, incoming = false): DmConversationRow {
  const now = nowSeconds();
  return {
    owner,
    peer,
    lastMessageAt: now,
    lastMessagePreview: '',
    lastMessageFromMe: false,
    lastReadAt: incoming ? 0 : now,
    unreadCount: 0,
    isRequest,
    receiveState: null,
    updatedAt: Date.now(),
  };
}

async function fetchUserIds(
  owner: Pubky,
  reach: UserStreamReach.FOLLOWING | UserStreamReach.FOLLOWERS,
  max: number,
): Promise<Pubky[]> {
  const ids: Pubky[] = [];
  for (let skip = 0; ids.length < max; skip += NEXUS_USER_STREAM_MAX_LIMIT) {
    const page = await NexusUserStreamService.fetch({
      streamId: `${owner}:${reach}`,
      params: { skip, limit: NEXUS_USER_STREAM_MAX_LIMIT },
    });
    ids.push(...page);
    if (page.length < NEXUS_USER_STREAM_MAX_LIMIT) break;
  }
  return ids.slice(0, max);
}

/**
 * Direct messages: pubky-messenger protocol v2 over the homeserver session, mirrored into the
 * messages database. Every method takes the account (`owner`) explicitly.
 */
export class MessagesApplication {
  private constructor() {}

  private static async getClient(owner: Pubky): Promise<MessagingClient | null> {
    if (cachedClient?.owner === owner) return cachedClient;
    cachedClient = null;
    const created = await MessagesService.createClient(owner);
    if (created) cachedClient = created;
    return created;
  }

  private static async requireClient(owner: Pubky): Promise<MessagingClient> {
    const client = await this.getClient(owner);
    if (!client) {
      throw Err.auth(AuthErrorCode.UNAUTHORIZED, 'Messages are not enabled for this session.', {
        service: ErrorService.Local,
        operation: 'requireClient',
      });
    }
    return client;
  }

  /** Drops the in-memory messaging key and candidate cache (logout, account switch). */
  static resetSession(): void {
    cachedClient?.identity.dispose();
    cachedClient = null;
    cachedCandidates = null;
  }

  /**
   * Whether the session can message. When the key is available, publishes the key record if the
   * homeserver does not already hold this exact messaging key, so peers can find it.
   */
  static async ensureReady(owner: Pubky): Promise<'locked' | 'ready'> {
    const messaging = await this.getClient(owner);
    if (!messaging) return 'locked';
    const published = await messaging.client.fetchKeyRecord(owner, { refresh: true }).catch(() => null);
    if (published?.messagingKey !== messaging.messagingKey) await messaging.client.publishKeyRecord();
    return 'ready';
  }

  /** Whether `peer` has published a messaging key, from a cache that expires after a few minutes. */
  static async getPeerState(owner: Pubky, peer: Pubky): Promise<PeerMessagingState> {
    const cached = await MessagesModel.getKeyRecord(owner, peer);
    if (cached && Date.now() - cached.checkedAt < MESSAGES_KEY_RECORD_TTL_MS) return cached.state;
    const messaging = await this.getClient(owner);
    if (!messaging) return 'unknown';
    const record = await messaging.client.fetchKeyRecord(peer, { refresh: true });
    const state: DmKeyRecordState = record ? 'enabled' : 'missing';
    await MessagesModel.putKeyRecords([{ owner, peer, state, checkedAt: Date.now() }]);
    return state;
  }

  // Local reads

  static listConversations(owner: Pubky): Promise<DmConversationRow[]> {
    return MessagesModel.listConversations(owner);
  }

  static getConversation(owner: Pubky, peer: Pubky): Promise<DmConversationRow | undefined> {
    return MessagesModel.getConversation(owner, peer);
  }

  static listMessages(owner: Pubky, peer: Pubky): Promise<DmMessageRow[]> {
    return MessagesModel.listMessages(owner, peer);
  }

  /** Creates the local conversation row when the owner opens a thread that has no messages yet. */
  static async openConversation(owner: Pubky, peer: Pubky): Promise<void> {
    if (await MessagesModel.getConversation(owner, peer)) return;
    await MessagesModel.putConversation(emptyConversation(owner, peer, false));
  }

  /** Recomputes the list preview and unread count of one conversation from its stored messages. */
  private static async refreshSummary(owner: Pubky, peer: Pubky, changes: Partial<DmConversationRow> = {}) {
    const existing = (await MessagesModel.getConversation(owner, peer)) ?? emptyConversation(owner, peer, false);
    const messages = await MessagesModel.listMessages(owner, peer);
    const last = messages[messages.length - 1];
    const next: DmConversationRow = { ...existing, ...changes };
    if (last) {
      next.lastMessageAt = last.timestamp;
      next.lastMessagePreview = last.content;
      next.lastMessageFromMe = last.sender === owner;
    }
    next.unreadCount = messages.filter((m) => m.sender !== owner && m.timestamp > next.lastReadAt).length;
    next.updatedAt = Date.now();
    await MessagesModel.putConversation(next);
  }

  static async markRead(owner: Pubky, peer: Pubky): Promise<void> {
    const conversation = await MessagesModel.getConversation(owner, peer);
    if (!conversation || conversation.unreadCount === 0) return;
    const messages = await MessagesModel.listMessages(owner, peer);
    const latest = messages.reduce((max, m) => Math.max(max, m.timestamp), conversation.lastReadAt);
    await MessagesModel.putConversation({ ...conversation, lastReadAt: latest, unreadCount: 0, updatedAt: Date.now() });
  }

  // Sending

  /** Encrypts, records locally with its prepared publication, then publishes. Returns the message id. */
  static async send(owner: Pubky, peer: Pubky, content: string): Promise<string> {
    if (peer === owner) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Cannot message yourself.', {
        service: ErrorService.Local,
        operation: 'send',
      });
    }
    const { client } = await this.requireClient(owner);
    const prepared = await client.prepareMessage(peer, content);
    const id = prepared.id();
    await MessagesModel.putPendingMessage(
      {
        owner,
        peer,
        id,
        sender: owner,
        content,
        timestamp: prepared.timestamp(),
        seenAt: Date.now(),
        status: 'sending',
        verified: true,
      },
      { owner, peer, id, prepared: prepared.toJSON(), createdAt: Date.now(), attempts: 1 },
    );
    // Replying accepts a message request.
    await this.refreshSummary(owner, peer, { isRequest: false });
    await this.publish(owner, peer, id, prepared);
    return id;
  }

  /** Publishes a failed message again with the same id and encrypted bytes. */
  static async retry(owner: Pubky, id: string): Promise<void> {
    const pending = await MessagesModel.getOutbox(owner, id);
    if (!pending) return;
    await this.requireClient(owner);
    await MessagesModel.putOutbox({ ...pending, attempts: pending.attempts + 1 });
    await MessagesModel.setMessageStatus(owner, id, 'sending');
    await this.publish(owner, pending.peer, id, PreparedMessage.fromJSON(pending.prepared));
  }

  private static async publish(owner: Pubky, peer: Pubky, id: string, prepared: PreparedMessage): Promise<void> {
    const { client } = await this.requireClient(owner);
    try {
      await client.publishMessage(prepared);
    } catch (error) {
      await MessagesModel.setMessageStatus(owner, id, 'failed');
      throw error;
    }
    await MessagesModel.completeOutbox(owner, id);
    await this.refreshSummary(owner, peer);
  }

  /**
   * Removes the owner's message from their homeserver. It lives only there, so the peer loses it too.
   * A message that never published is deleted as well: a lost response may still have stored it.
   */
  static async unsend(owner: Pubky, peer: Pubky, id: string): Promise<void> {
    const { client } = await this.requireClient(owner);
    const report = await client.deleteMessagesWithReport([id], peer);
    if (report.failures.length > 0) {
      throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Could not unsend the message.', {
        service: ErrorService.Homeserver,
        operation: 'unsend',
        context: { failures: report.failures.length },
      });
    }
    await MessagesModel.deleteMessage(owner, id);
    await this.refreshSummary(owner, peer);
  }

  // Receiving

  /**
   * Downloads only messages not seen before in the conversation with `peer`, stores them, and drops
   * local copies the peer has unsent. Returns how many new messages came from the peer.
   */
  static async syncConversation(owner: Pubky, peer: Pubky): Promise<number> {
    const { client } = await this.requireClient(owner);
    const conversation = await MessagesModel.getConversation(owner, peer);
    const state = conversation?.receiveState ? ReceiveState.fromJSON(conversation.receiveState) : new ReceiveState();
    const received = await client.receiveNewMessages(peer, state);

    const rows: DmMessageRow[] = [];
    for (const item of received.messages) {
      if (item.message) {
        const id = messageUuid(item.id);
        const fromMe = item.message.sender === owner;
        const local = await MessagesModel.getMessage(owner, id);
        rows.push({
          owner,
          peer,
          id,
          sender: item.message.sender,
          content: item.message.content,
          timestamp: item.message.timestamp,
          seenAt: local?.seenAt ?? Date.now(),
          // An own message seen on the homeserver is published, whatever the local row said.
          status: fromMe ? 'sent' : 'received',
          verified: item.message.verified,
        });
        if (fromMe && (local?.status === 'failed' || local?.status === 'sending')) {
          await MessagesModel.completeOutbox(owner, id);
        }
      }
      state.acknowledge(item);
    }
    if (rows.length > 0) await MessagesModel.putMessages(rows);

    if (received.complete) {
      // Messages the peer unsent are gone from their listing; mirror that locally.
      const listed = new Set(state.acknowledgedIds().map((messageId) => messageUuid(messageId)));
      const local = await MessagesModel.listMessages(owner, peer);
      for (const message of local) {
        if (message.sender === peer && !listed.has(message.id)) await MessagesModel.deleteMessage(owner, message.id);
      }
    }

    await this.refreshSummary(owner, peer, { receiveState: state.toJSON() });
    return rows.filter((row) => row.sender === peer).length;
  }

  /** Checks every known conversation except `skip` (the open one, checked separately). */
  static async syncConversations(owner: Pubky, skip?: Pubky | null): Promise<void> {
    const conversations = await MessagesModel.listConversations(owner);
    for (const conversation of conversations) {
      if (conversation.peer === skip) continue;
      await this.syncConversation(owner, conversation.peer);
    }
  }

  private static async getCandidates(owner: Pubky): Promise<{ following: Set<Pubky>; peers: Pubky[] }> {
    if (cachedCandidates?.owner === owner && Date.now() - cachedCandidates.fetchedAt < MESSAGES_CANDIDATES_TTL_MS) {
      return cachedCandidates;
    }
    const half = Math.floor(MESSAGES_DISCOVERY_MAX_PEERS / 2);
    const following = await fetchUserIds(owner, UserStreamReach.FOLLOWING, half);
    const followers = await fetchUserIds(
      owner,
      UserStreamReach.FOLLOWERS,
      MESSAGES_DISCOVERY_MAX_PEERS - following.length,
    );
    const peers = [...new Set([...following, ...followers])].filter((peer) => peer !== owner);
    cachedCandidates = { owner, following: new Set(following), peers, fetchedAt: Date.now() };
    return cachedCandidates;
  }

  /**
   * Finds conversations started by follows and followers that are not on this device yet. A message
   * from someone the owner does not follow becomes a request until the owner replies.
   */
  static async discover(owner: Pubky): Promise<Pubky[]> {
    const { client } = await this.requireClient(owner);
    const { following, peers } = await this.getCandidates(owner);
    const known = new Set((await MessagesModel.listConversations(owner)).map((c) => c.peer));
    const unknownPeers = peers.filter((peer) => !known.has(peer));
    if (unknownPeers.length === 0) return [];

    const result = await client.discoverConversations(unknownPeers);
    const checkedAt = Date.now();
    await MessagesModel.putKeyRecords([
      ...result.active.map((peer) => ({ owner, peer, state: 'enabled' as const, checkedAt })),
      ...result.withoutKey.map((peer) => ({ owner, peer, state: 'missing' as const, checkedAt })),
    ]);
    for (const peer of result.active) {
      await MessagesModel.putConversation(emptyConversation(owner, peer, !following.has(peer), true));
      await this.syncConversation(owner, peer);
    }
    return result.active;
  }

  /** Logout: forget the key and remove every message from this device. */
  static async clear(): Promise<void> {
    this.resetSession();
    await MessagesModel.clearAll();
  }
}
