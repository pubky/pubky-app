import { MessagesApplication, type PeerMessagingState } from '@/application/messages/messages';
import { Logger } from '@/libs/logger/logger';
import type { DmConversationRow, DmMessageRow } from '@/models/messages/messages.types';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useMessagesStore } from '@/stores/messages/messages.store';

function currentOwner(): Pubky | null {
  return useAuthStore.getState().currentUserPubky;
}

/**
 * Direct messages (`docs/adr/0031-direct-messages-vibe.md`). `get*` reads the messages database only,
 * `fetch*` talks to homeservers, `commit*` writes locally first and then publishes.
 */
export class MessagesController {
  private constructor() {}

  /** Checks whether the session holds a messaging key, publishing the key record when it does. */
  static async fetchStatus(): Promise<void> {
    const owner = currentOwner();
    if (!owner) return;
    try {
      const status = await MessagesApplication.ensureReady(owner);
      if (currentOwner() === owner) useMessagesStore.getState().setStatus(status);
    } catch (error) {
      Logger.warn('[messages] status check failed', { error });
      if (currentOwner() === owner) useMessagesStore.getState().setStatus('error');
    }
  }

  /** Marks the thread on screen so the coordinator checks it on every tick. */
  static setActivePeer(peer: Pubky | null): void {
    useMessagesStore.getState().setActivePeer(peer);
  }

  // Local reads (live queries)

  static getConversations(owner: Pubky): Promise<DmConversationRow[]> {
    return MessagesApplication.listConversations(owner);
  }

  static getConversation(owner: Pubky, peer: Pubky): Promise<DmConversationRow | undefined> {
    return MessagesApplication.getConversation(owner, peer);
  }

  static getMessages(owner: Pubky, peer: Pubky): Promise<DmMessageRow[]> {
    return MessagesApplication.listMessages(owner, peer);
  }

  // Network

  static async fetchPeerState(peer: Pubky): Promise<PeerMessagingState> {
    const owner = currentOwner();
    if (!owner) return 'unknown';
    return MessagesApplication.getPeerState(owner, peer);
  }

  static async fetchConversation(peer: Pubky): Promise<number> {
    const owner = currentOwner();
    if (!owner) return 0;
    return MessagesApplication.syncConversation(owner, peer);
  }

  static async fetchConversations(): Promise<void> {
    const owner = currentOwner();
    if (!owner) return;
    await MessagesApplication.syncConversations(owner, useMessagesStore.getState().activePeer);
  }

  static async fetchDiscovery(): Promise<void> {
    const owner = currentOwner();
    if (!owner) return;
    await MessagesApplication.discover(owner);
  }

  // Writes

  static async commitOpenConversation(peer: Pubky): Promise<void> {
    const owner = currentOwner();
    if (!owner) return;
    await MessagesApplication.openConversation(owner, peer);
  }

  static async commitSend({ peer, content }: { peer: Pubky; content: string }): Promise<void> {
    const owner = currentOwner();
    if (!owner) return;
    await MessagesApplication.send(owner, peer, content);
  }

  static async commitRetry(id: string): Promise<void> {
    const owner = currentOwner();
    if (!owner) return;
    await MessagesApplication.retry(owner, id);
  }

  static async commitUnsend({ peer, id }: { peer: Pubky; id: string }): Promise<void> {
    const owner = currentOwner();
    if (!owner) return;
    await MessagesApplication.unsend(owner, peer, id);
  }

  static async commitMarkRead(peer: Pubky): Promise<void> {
    const owner = currentOwner();
    if (!owner) return;
    await MessagesApplication.markRead(owner, peer);
  }

  /** Session end: forgets the in-memory messaging key and the Messages state. */
  static resetSession(): void {
    useMessagesStore.getState().reset();
    MessagesApplication.resetSession();
  }

  /** Logout: removes every message from this device. */
  static async clear(): Promise<void> {
    this.resetSession();
    await MessagesApplication.clear();
  }
}
