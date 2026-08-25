import type { RefObject } from 'react';
import type { AppError } from '@/libs/error/error';

export enum PaykitSetupFlowStatus {
  IDLE = 'idle',
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
  /** Begins the flow: generates CSRF state + the setup URL. */
  start: () => void;
  /** Resets back to idle (e.g. on modal close/cancel). */
  reset: () => void;
};
