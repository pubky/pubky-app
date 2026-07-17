import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
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
  /** Probes the Lock Server's readiness (run when the modal opens); gates `start`. */
  prepare: () => Promise<void>;
  /** Begins the flow: generates CSRF state + the connect URL. */
  start: () => Promise<void>;
  /** Resets back to idle (e.g. on modal close/cancel). */
  reset: () => void;
};
