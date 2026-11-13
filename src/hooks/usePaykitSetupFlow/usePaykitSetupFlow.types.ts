import type { RefObject } from 'react';
import type { AppError } from '@/libs/error/error';

export enum PaykitSetupFlowStatus {
  IDLE = 'idle',
  /** Asking the Lock Server whether the creator's Paykit setup is already done. */
  CHECKING = 'checking',
  /** The check got no usable answer: nothing opens until the creator runs it again. */
  UNAVAILABLE = 'unavailable',
  /**
   * Paykit already holds this creator, which makes it refuse `/setup`: only a reconnect can set it up
   * again. Nothing opens until the creator asks for it, because a reconnect moves Bitcoin receiving to
   * a new account.
   */
  RECONNECT_REQUIRED = 'reconnect-required',
  /** The setup failed and Paykit holds no creator: nothing was set up, so a fresh setup is the way back. */
  SETUP_INCOMPLETE = 'setup-incomplete',
  AWAITING_APPROVAL = 'awaiting-approval',
  SUCCESS = 'success',
  ERROR = 'error',
}

/** Which Paykit page the iframe shows: the initial `/setup`, or `/setup/reconnect` for a creator Paykit holds. */
export type PaykitSetupMode = 'setup' | 'reconnect';

export type UsePaykitSetupFlowReturn = {
  status: PaykitSetupFlowStatus;
  /** Which Paykit page the current (or last) approval used. */
  mode: PaykitSetupMode;
  /** Paykit `/setup` or `/setup/reconnect` URL to load in an iframe (null until the flow starts). */
  setupUrl: string | null;
  error: AppError | null;
  /** Attach to the setup iframe so the bridge can verify the message source. */
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /**
   * Asks the Lock Server for the creator's Paykit setup status: `ready` records the connection,
   * `setup_required` asks Paykit whether it already holds the creator and then starts the setup (or
   * stops at `RECONNECT_REQUIRED`), `unavailable` stops at `UNAVAILABLE`.
   */
  check: () => Promise<void>;
  /** Begins the initial setup: generates CSRF state + the `/setup` URL. */
  start: () => void;
  /** Begins the reconnect for a creator Paykit holds: generates CSRF state + the `/setup/reconnect` URL. */
  reconnect: () => void;
  /** Resets back to idle (e.g. on modal close/cancel). */
  reset: () => void;
};
