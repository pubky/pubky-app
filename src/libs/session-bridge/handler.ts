import { isAllowedBridgeOrigin } from './allowlist';
import { buildSessionBridgeReply, isPubkySessionRequest } from './messages';
import { parsePersistedAuthStoreValue, SESSION_BRIDGE_AUTH_STORAGE_KEY } from './persisted-session';

export type SessionBridgeMessageEvent = Pick<MessageEvent, 'origin' | 'source' | 'data'>;
export type SessionBridgeStorageEvent = Pick<StorageEvent, 'key' | 'newValue'>;

export type SessionBridgeHandlerDeps = {
  allowlist: string[];
  getSessionExport: () => string | null;
};

function postReply(source: MessageEventSource, origin: string, sessionExport: string | null): void {
  (source as Window).postMessage(buildSessionBridgeReply(sessionExport), origin);
}

export function createSessionBridgeHandler(deps: SessionBridgeHandlerDeps) {
  let subscriber: { source: MessageEventSource; origin: string } | null = null;

  function handleMessage(event: SessionBridgeMessageEvent): void {
    if (event.source === null) {
      return;
    }

    if (!isAllowedBridgeOrigin(event.origin, deps.allowlist)) {
      return;
    }

    if (!isPubkySessionRequest(event.data)) {
      return;
    }

    subscriber = { source: event.source, origin: event.origin };
    postReply(event.source, event.origin, deps.getSessionExport());
  }

  function handleStorage(event: SessionBridgeStorageEvent): void {
    if (subscriber === null) {
      return;
    }

    if (event.key !== SESSION_BRIDGE_AUTH_STORAGE_KEY && event.key !== null) {
      return;
    }

    const sessionExport = event.key === null ? null : parsePersistedAuthStoreValue(event.newValue);
    postReply(subscriber.source, subscriber.origin, sessionExport);
  }

  return { handleMessage, handleStorage };
}
