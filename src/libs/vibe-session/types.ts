export const PUBKY_SESSION_REQUEST_TYPE = 'pubky-session-request';
export const PUBKY_SESSION_TYPE = 'pubky-session';
export const PUBKY_SESSION_NONE_TYPE = 'pubky-session-none';
export const PUBKY_SESSION_BRIDGE_VERSION = 1;

export const VIBE_SESSION_LOAD_TIMEOUT_MS = 15000;
export const VIBE_SESSION_REPLY_TIMEOUT_MS = 3000;

export type BridgeTimeoutPhase = 'load' | 'reply';

export type BridgeRequestResult =
  | { kind: 'export'; sessionExport: string }
  | { kind: 'none' }
  | { kind: 'timeout'; phase: BridgeTimeoutPhase }
  | { kind: 'unavailable'; error?: unknown }
  | { kind: 'aborted' };
