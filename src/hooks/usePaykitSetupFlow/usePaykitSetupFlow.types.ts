import type { RefObject } from 'react';
import type { AppError } from '@/libs/error/error';

export enum PaykitSetupFlowStatus {
  IDLE = 'idle',
  /** Asking the Lock Server whether the creator's Paykit setup is done, or Paykit whether it holds the creator. */
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
   * True once the `/setup` page has posted `paykit-setup-ready`, which it does as soon as it renders.
   * Until then the iframe stays hidden: a page that failed (a JSON error body, a proxy page) never
   * posts it, and must never be shown.
   */
  isSetupReady: boolean;
  /**
   * True when the flow is in `ERROR` because the `/setup` or `/setup/reconnect` page never reported
   * it rendered. The creator saw no QR, so copy that asks them to approve in time does not apply.
   */
  isSetupPageFailed: boolean;
  /** Attach to the setup iframe's `onLoad`: starts the short wait for the ready message. */
  onSetupLoad: () => void;
  /**
   * Asks the Lock Server for the creator's Paykit setup status: `ready` records the connection,
   * `setup_required` asks Paykit whether it already holds the creator and then starts the setup (or
   * stops at `RECONNECT_REQUIRED`), `unavailable` stops at `UNAVAILABLE`.
   */
  check: () => Promise<void>;
  /** Like `check`, but asks only Paykit whether it holds the creator (#2984). */
  checkHeld: () => Promise<void>;
  /** Begins the initial setup: generates CSRF state + the `/setup` URL. */
  start: () => void;
  /** Begins the reconnect for a creator Paykit holds: generates CSRF state + the `/setup/reconnect` URL. */
  reconnect: () => void;
  /** Resets back to idle (e.g. on modal close/cancel). */
  reset: () => void;
};
