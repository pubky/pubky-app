/** `unavailable`: the Lock Server answered it; `error`: the check failed. docs/locks.md, "Locks settings page". */
export type LocksSettingsStatus = 'loading' | 'not-set-up' | 'set-up' | 'unavailable' | 'error';

export type UseLocksSettingsStatusOptions = {
  /**
   * True while a setup dialog runs its own checks: no recheck when the tab is shown again, and a check sent
   * before the dialog opened is dropped. When it turns false with Paykit connected, the page shows set up,
   * also after **Cancel** or Esc, which close the dialog without `onSuccess`.
   */
  paused?: boolean;
};

export type UseLocksSettingsStatusReturn = {
  status: LocksSettingsStatus;
  /** Asks the Lock Server again, showing loading meanwhile. */
  recheck: () => void;
  /** For a setup dialog that finished: its own check already confirmed the setup. */
  markSetUp: () => void;
};
