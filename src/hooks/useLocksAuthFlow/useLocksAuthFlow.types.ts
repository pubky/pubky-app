import type { Session as LocksSdkSession } from '@synonymdev/locks-sdk';
import type { RefObject } from 'react';
import type { AppError } from '@/libs/error/error';

export enum LocksAuthFlowStatus {
  /** Probing the Lock Server's readiness (modal just opened). */
  CHECKING_SERVER = 'checking-server',
  /** Server reachable + ready — the Intro step's "Continue" is enabled. */
  IDLE = 'idle',
  /** Server unreachable / not ready — Intro shows an error, "Continue" is disabled. */
  SERVER_UNAVAILABLE = 'server-unavailable',
  CONNECTING = 'connecting',
  AWAITING_APPROVAL = 'awaiting-approval',
  EXCHANGING = 'exchanging',
  SUCCESS = 'success',
  ERROR = 'error',
}

export type UseLocksAuthFlowReturn = {
  status: LocksAuthFlowStatus;
  /** Lock Server `/connect` URL to load in the iframe (null until generated). */
  connectUrl: string | null;
  /** The established Locks session, once successful. */
  session: LocksSdkSession | null;
  error: AppError | null;
  /** Attach to the auth iframe so the bridge can verify the message source. */
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /**
   * True once the `/connect` shell has posted its first `locks-auth-resize` message, which it does as
   * soon as it renders. Until then the iframe stays hidden: a page that failed (a JSON error body,
   * a proxy page) never posts it, and must never be shown.
   */
  isConnectReady: boolean;
  /** Attach to the auth iframe's `onLoad`: starts the short wait for the ready message. */
  onConnectLoad: () => void;
  /** Probes the Lock Server's readiness (run when the modal opens); gates `start`. */
  prepare: () => Promise<void>;
  /** Begins the flow: generates CSRF state + the connect URL. */
  start: () => Promise<void>;
  /** Resets back to idle (e.g. on modal close/cancel). */
  reset: () => void;
};
