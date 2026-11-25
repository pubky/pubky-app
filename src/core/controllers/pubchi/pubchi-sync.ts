import { isPubkyId } from '@/libs/pubchi/schemas/pubky';
import type { Pubky } from '@/models/models.types';

export const PUBCHI_SYNC_CHANNEL = 'pubchi';
export const PUBCHI_SYNC_MAX_AGE_MS = 15_000;
export const PUBCHI_SYNC_DEBOUNCE_MS = 100;

export type PubchiSyncKind = 'created' | 'config-saved' | 'removed' | 'devices-changed' | 'signed-out';

export type PubchiSyncMessage = {
  owner: Pubky;
  kind: PubchiSyncKind;
  at: number;
};

const PUBCHI_SYNC_KINDS = new Set<PubchiSyncKind>([
  'created',
  'config-saved',
  'removed',
  'devices-changed',
  'signed-out',
]);
const subscribers = new Set<(message: PubchiSyncMessage) => void>();
let subscriptionChannel: BroadcastChannel | undefined;

export function publishPubchiSync(owner: Pubky | null, kind: PubchiSyncKind): void {
  if (!owner || typeof BroadcastChannel === 'undefined') return;

  const channel = new BroadcastChannel(PUBCHI_SYNC_CHANNEL);
  try {
    channel.postMessage({ owner, kind, at: Date.now() } satisfies PubchiSyncMessage);
  } finally {
    channel.close();
  }
}

export function subscribeToPubchiSync(onMessage: (message: PubchiSyncMessage) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;

  if (!subscriptionChannel) {
    subscriptionChannel = new BroadcastChannel(PUBCHI_SYNC_CHANNEL);
    subscriptionChannel.addEventListener('message', handleSubscriptionMessage);
  }
  subscribers.add(onMessage);
  return () => {
    subscribers.delete(onMessage);
    if (subscribers.size === 0) {
      subscriptionChannel?.removeEventListener('message', handleSubscriptionMessage);
      subscriptionChannel?.close();
      subscriptionChannel = undefined;
    }
  };
}

function handleSubscriptionMessage(event: MessageEvent<unknown>): void {
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  const candidate = message as Partial<PubchiSyncMessage>;
  const now = Date.now();
  if (
    typeof candidate.owner !== 'string' ||
    !isPubkyId(candidate.owner) ||
    typeof candidate.kind !== 'string' ||
    typeof candidate.at !== 'number' ||
    !Number.isFinite(candidate.at) ||
    candidate.at > now + 5_000 ||
    now - candidate.at > PUBCHI_SYNC_MAX_AGE_MS ||
    !PUBCHI_SYNC_KINDS.has(candidate.kind as PubchiSyncKind)
  ) {
    return;
  }
  for (const subscriber of subscribers) subscriber(candidate as PubchiSyncMessage);
}
