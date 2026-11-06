import type { RefObject } from 'react';
import type { AppError } from '@/libs/error/error';

export enum PaykitSetupFlowStatus {
  IDLE = 'idle',
  /** Asking the Lock Server whether the creator's Paykit setup is already done. */
  CHECKING = 'checking',
  /** The check got no usable answer: nothing opens until the creator runs it again. */
  UNAVAILABLE = 'unavailable',
  AWAITING_APPROVAL = 'awaiting-approval',
  SUCCESS = 'success',
  ERROR = 'error',
}

export type UsePaykitSetupFlowReturn = {
  status: PaykitSetupFlowStatus;
  /** Paykit `/setup` URL to load in an iframe (null until the flow starts). */
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
  /** Attach to the setup iframe's `onLoad`: starts the short wait for the ready message. */
  onSetupLoad: () => void;
  /**
   * Asks the Lock Server for the creator's Paykit setup status: `ready` records the connection,
   * `setup_required` starts the setup, `unavailable` stops at `UNAVAILABLE`.
   */
  check: () => Promise<void>;
  /** Begins the flow: generates CSRF state + the setup URL. */
  start: () => void;
  /** Resets back to idle (e.g. on modal close/cancel). */
  reset: () => void;
};
