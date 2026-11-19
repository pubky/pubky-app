import {
  MESSAGING_KEY_PATH,
  MessagingIdentity,
  type MessengerStorage,
  MessengerV2Client,
  StorageError,
} from 'pubky-messenger-ts';
import type { Pubky } from '@/models/models.types';
import { extractStatusCode } from '@/services/homeserver/error.utils';
import { HomeserverService } from '@/services/homeserver/homeserver';

/** A messaging client bound to one account, its messaging identity and public messaging key. */
export interface MessagingClient {
  owner: Pubky;
  messagingKey: string;
  identity: MessagingIdentity;
  client: MessengerV2Client;
}

async function withStorageErrors<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    // The messenger classifies retries (timeouts, 429, 5xx) by status; HomeserverService already
    // captured and logged the failure, so only the status is carried across.
    throw new StorageError(error instanceof Error ? error.message : String(error), {
      status: extractStatusCode(error),
      cause: error,
    });
  }
}

/**
 * pubky-messenger protocol v2 over the app's homeserver session (`docs/adr/0031-direct-messages-vibe.md`).
 * Every request goes through `HomeserverService`: owned writes use the active grant, reads are public.
 */
export class MessagesService {
  private constructor() {}

  /** Storage adapter for `owner`: public reads and listings, owned writes under `/pub/private_messages/`. */
  static createStorage(owner: Pubky): MessengerStorage {
    return {
      list: (dir, { cursor, limit }) =>
        withStorageErrors(() => HomeserverService.list({ baseDirectory: dir, cursor, limit })),
      get: (address) => withStorageErrors(() => HomeserverService.getPublicBytesIfExists(address)),
      put: (path, body) =>
        withStorageErrors(() => HomeserverService.putBlob({ url: `pubky://${owner}${path}`, blob: body })),
      delete: (path) => withStorageErrors(() => HomeserverService.deleteIdempotent(`pubky://${owner}${path}`)),
    };
  }

  /**
   * Derives the messaging keypair from the session's scoped encryption key and binds a client to it.
   * @returns `null` while the session has no approved messaging key (the Messages upgrade has not run).
   */
  static async createClient(owner: Pubky): Promise<MessagingClient | null> {
    const seed = await HomeserverService.deriveScopedEncryptionKey(MESSAGING_KEY_PATH);
    if (!seed) return null;
    try {
      const identity = MessagingIdentity.fromSeed(seed);
      return {
        owner,
        messagingKey: identity.publicKeyZ32(),
        identity,
        client: new MessengerV2Client({ owner, identity, storage: this.createStorage(owner) }),
      };
    } finally {
      seed.fill(0);
    }
  }
}
