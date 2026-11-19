/** `unavailable`: the Lock Server answered it; `error`: the check failed. docs/locks.md, "Locks settings page". */
export type LocksSettingsStatus = 'loading' | 'not-set-up' | 'set-up' | 'unavailable' | 'error';

export type UseLocksSettingsStatusOptions = {
  /** Skips the recheck when the tab is shown again, while a setup dialog runs its own checks. */
  paused?: boolean;
};

export type UseLocksSettingsStatusReturn = {
  status: LocksSettingsStatus;
  /** Asks the Lock Server again, showing loading meanwhile. */
  recheck: () => void;
  /** For a setup dialog that finished: its own check already confirmed the setup. */
  markSetUp: () => void;
};
