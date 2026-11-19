import { MessagingIdentity, type MessengerStorage, MessengerV2Client } from 'pubky-messenger-ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagesModel } from '@/models/messages/messages';
import { MessagesService } from '@/services/messages/messages';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { MessagesApplication } from './messages';

// Fictional identities from the pubky-messenger fixtures (secret keys 11 x 32 and 22 x 32).
const ALICE = '4bfmrcuwfq4ksqoupn6wcfxrh5enr1izdeyszmhfrntuf1mzoh5o';
const BOB = 'wnpkm7d4c7caym93kzhpamjkn11hu8jdz4m9o3y1x9huopniwuay';
const SECRETS: Record<string, Uint8Array> = {
  [ALICE]: new Uint8Array(32).fill(0x11),
  [BOB]: new Uint8Array(32).fill(0x22),
};

/** Two homeservers in memory: each owner writes under `pubky://<owner>/`, anyone reads. */
function memoryHomeservers() {
  const files = new Map<string, Uint8Array>();
  const storageFor = (owner: string): MessengerStorage => ({
    list: async (dir, { cursor, limit }) => {
      const entries = [...files.keys()].filter((key) => key.startsWith(dir)).sort();
      const start = cursor ? entries.findIndex((key) => key > cursor) : 0;
      return start < 0 ? [] : entries.slice(start, start + limit);
    },
    get: async (address) => files.get(address) ?? null,
    put: async (path, body) => void files.set(`pubky://${owner}${path}`, body.slice()),
    delete: async (path) => void files.delete(`pubky://${owner}${path}`),
  });
  return { files, storageFor };
}

let homeservers: ReturnType<typeof memoryHomeservers>;
let following: Record<string, string[]>;
let followers: Record<string, string[]>;

beforeEach(async () => {
  homeservers = memoryHomeservers();
  following = { [ALICE]: [BOB], [BOB]: [] };
  followers = { [ALICE]: [], [BOB]: [ALICE] };
  vi.spyOn(MessagesService, 'createClient').mockImplementation(async (owner) => {
    const identity = MessagingIdentity.fromIdentitySecret(SECRETS[owner]);
    return {
      owner,
      identity,
      messagingKey: identity.publicKeyZ32(),
      client: new MessengerV2Client({ owner, identity, storage: homeservers.storageFor(owner) }),
    };
  });
  vi.spyOn(NexusUserStreamService, 'fetch').mockImplementation(async ({ streamId, params }) => {
    const [owner, reach] = String(streamId).split(':');
    if ((params.skip ?? 0) > 0) return [];
    return reach === 'following' ? following[owner] : followers[owner];
  });
  MessagesApplication.resetSession();
  await MessagesModel.clearAll();
});

afterEach(() => {
  MessagesApplication.resetSession();
  vi.restoreAllMocks();
});

/** Act as `owner`: the application caches one client per account, as a signed-in tab does. */
async function as<T>(owner: string, task: () => Promise<T>): Promise<T> {
  MessagesApplication.resetSession();
  return task();
}

describe('MessagesApplication', () => {
  it('publishes the key record once the session holds the messaging key', async () => {
    await expect(as(ALICE, () => MessagesApplication.ensureReady(ALICE))).resolves.toBe('ready');
    expect(homeservers.files.has(`pubky://${ALICE}/pub/private_messages/v2/key.json`)).toBe(true);
  });

  it('reports locked while the session has no messaging key', async () => {
    vi.mocked(MessagesService.createClient).mockResolvedValueOnce(null);
    await expect(MessagesApplication.ensureReady(ALICE)).resolves.toBe('locked');
  });

  it('sends, discovers a request, replies to accept it, and tracks unread', async () => {
    await as(ALICE, () => MessagesApplication.ensureReady(ALICE));
    await as(BOB, () => MessagesApplication.ensureReady(BOB));

    const id = await as(ALICE, () => MessagesApplication.send(ALICE, BOB, 'hello bob'));
    const sent = await MessagesModel.getMessage(ALICE, id);
    expect(sent).toMatchObject({ status: 'sent', content: 'hello bob', sender: ALICE });

    // Bob does not follow Alice: her thread arrives as a request with one unread message.
    await expect(as(BOB, () => MessagesApplication.discover(BOB))).resolves.toEqual([ALICE]);
    const request = await MessagesModel.getConversation(BOB, ALICE);
    expect(request).toMatchObject({ isRequest: true, unreadCount: 1, lastMessagePreview: 'hello bob' });

    await MessagesApplication.markRead(BOB, ALICE);
    expect(await MessagesModel.getConversation(BOB, ALICE)).toMatchObject({ unreadCount: 0 });

    await as(BOB, () => MessagesApplication.send(BOB, ALICE, 'hi alice'));
    expect(await MessagesModel.getConversation(BOB, ALICE)).toMatchObject({ isRequest: false });

    await expect(as(ALICE, () => MessagesApplication.syncConversation(ALICE, BOB))).resolves.toBe(1);
    const thread = await MessagesModel.listMessages(ALICE, BOB);
    expect(thread.map((m) => [m.sender, m.content, m.status])).toEqual([
      [ALICE, 'hello bob', 'sent'],
      [BOB, 'hi alice', 'received'],
    ]);
    expect(thread.every((m) => m.verified)).toBe(true);
  });

  it('removes an unsent message on both sides', async () => {
    await as(ALICE, () => MessagesApplication.ensureReady(ALICE));
    await as(BOB, () => MessagesApplication.ensureReady(BOB));
    const id = await as(ALICE, () => MessagesApplication.send(ALICE, BOB, 'oops'));
    await as(BOB, () => MessagesApplication.syncConversation(BOB, ALICE));
    expect(await MessagesModel.getMessage(BOB, id)).toBeDefined();

    await as(ALICE, () => MessagesApplication.unsend(ALICE, BOB, id));
    expect(await MessagesModel.getMessage(ALICE, id)).toBeUndefined();

    await as(BOB, () => MessagesApplication.syncConversation(BOB, ALICE));
    expect(await MessagesModel.getMessage(BOB, id)).toBeUndefined();
  });

  it('keeps a failed send in the outbox and publishes the same message on retry', async () => {
    await as(ALICE, () => MessagesApplication.ensureReady(ALICE));
    await as(BOB, () => MessagesApplication.ensureReady(BOB));
    const storage = homeservers.storageFor(ALICE);
    const put = vi.fn(storage.put).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(MessagesService.createClient).mockImplementation(async (owner) => {
      const identity = MessagingIdentity.fromIdentitySecret(SECRETS[owner]);
      return {
        owner,
        identity,
        messagingKey: identity.publicKeyZ32(),
        client: new MessengerV2Client({
          owner,
          identity,
          storage: { ...storage, put },
          fetchConfig: { maxAttempts: 1 },
        }),
      };
    });
    MessagesApplication.resetSession();

    await expect(MessagesApplication.send(ALICE, BOB, 'eventually')).rejects.toThrow();
    const [pending] = await MessagesModel.listOutbox(ALICE);
    expect(await MessagesModel.getMessage(ALICE, pending.id)).toMatchObject({ status: 'failed' });

    await MessagesApplication.retry(ALICE, pending.id);
    expect(await MessagesModel.getMessage(ALICE, pending.id)).toMatchObject({ status: 'sent' });
    await expect(MessagesModel.listOutbox(ALICE)).resolves.toEqual([]);
  });

  it('reports a peer without a key record as missing', async () => {
    await as(ALICE, () => MessagesApplication.ensureReady(ALICE));
    await expect(MessagesApplication.getPeerState(ALICE, BOB)).resolves.toBe('missing');
  });
});
