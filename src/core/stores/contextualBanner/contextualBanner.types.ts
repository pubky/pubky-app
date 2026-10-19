interface ContextualBannerState {
  /**
   * Whether the guest contextual banner is on screen. The banner, the FAB and the
   * Pulse consent controls are siblings in the root layout, so this store is the
   * channel that lets the other fixed bottom elements make room for it.
   */
  visible: boolean;
}

interface ContextualBannerActions {
  /** Flag the banner as visible. */
  show: () => void;
  /** Clear the flag (banner hidden or unmounted). */
  hide: () => void;
}

export type ContextualBannerStore = ContextualBannerState & ContextualBannerActions;

export const contextualBannerInitialState: ContextualBannerState = {
  visible: false,
};

export enum ContextualBannerActionTypes {
  SHOW = 'SHOW',
  HIDE = 'HIDE',
}
