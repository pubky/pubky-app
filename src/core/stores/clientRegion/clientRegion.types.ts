export type ClientRegionStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface ClientRegionState {
  status: ClientRegionStatus;
  /** The viewer's IP country (uppercase alpha-2) once read; null when the edge could not tell. */
  country: string | null;
}

interface ClientRegionActions {
  markLoading: () => void;
  markReady: (country: string | null) => void;
  markFailed: () => void;
}

export type ClientRegionStore = ClientRegionState & ClientRegionActions;

export const clientRegionInitialState: ClientRegionState = {
  status: 'idle',
  country: null,
};

export enum ClientRegionActionTypes {
  MARK_LOADING = 'MARK_LOADING',
  MARK_READY = 'MARK_READY',
  MARK_FAILED = 'MARK_FAILED',
}
