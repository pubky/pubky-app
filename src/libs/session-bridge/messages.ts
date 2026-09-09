export const PUBKY_SESSION_REQUEST_TYPE = 'pubky-session-request';
export const PUBKY_SESSION_TYPE = 'pubky-session';
export const PUBKY_SESSION_NONE_TYPE = 'pubky-session-none';
export const PUBKY_SESSION_BRIDGE_VERSION = 1;

export type PubkySessionRequestMessage = {
  type: typeof PUBKY_SESSION_REQUEST_TYPE;
  v: typeof PUBKY_SESSION_BRIDGE_VERSION;
};

export type PubkySessionMessage = {
  type: typeof PUBKY_SESSION_TYPE;
  v: typeof PUBKY_SESSION_BRIDGE_VERSION;
  sessionExport: string;
};

export type PubkySessionNoneMessage = {
  type: typeof PUBKY_SESSION_NONE_TYPE;
  v: typeof PUBKY_SESSION_BRIDGE_VERSION;
};

export type PubkySessionBridgeReply = PubkySessionMessage | PubkySessionNoneMessage;

export function isPubkySessionRequest(data: unknown): data is PubkySessionRequestMessage {
  if (data === null || typeof data !== 'object') {
    return false;
  }

  const message = data as { type?: unknown; v?: unknown };
  return message.type === PUBKY_SESSION_REQUEST_TYPE && message.v === PUBKY_SESSION_BRIDGE_VERSION;
}

export function buildSessionBridgeReply(sessionExport: string | null): PubkySessionBridgeReply {
  if (sessionExport === null || sessionExport.length === 0) {
    return { type: PUBKY_SESSION_NONE_TYPE, v: PUBKY_SESSION_BRIDGE_VERSION };
  }

  return { type: PUBKY_SESSION_TYPE, v: PUBKY_SESSION_BRIDGE_VERSION, sessionExport };
}
