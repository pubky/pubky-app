/**
 * The composer state captured when the lock switch goes on: this is the content that gets locked.
 * `isArticle` / `articleTitle` travel with it so an unlocked article renders as an article again.
 *
 * In-memory only — `File` handles are not serializable, so a reload loses the draft.
 */
export type TLockDraft = {
  content: string;
  attachments: File[];
  isArticle: boolean;
  articleTitle: string;
};

export interface UsePostInputLockOptions {
  isEnabled: boolean;
  /** Whether the composer has something to lock. The switch is disabled while it is empty, so a lock
   * can never wrap an empty body. */
  canEnable: boolean;
  /** Reads the composer as it stands, to be locked. Called when the switch goes on. */
  captureComposer: () => TLockDraft;
  /**
   * Puts the captured draft back into the composer. Called whenever the lock is abandoned — switch
   * off, sign-in cancelled, unlock method cancelled — because the content becomes a normal post again.
   */
  restoreComposer: (draft: TLockDraft) => void;
  /** Empties the composer so the creator can write the announcement teaser. */
  clearComposer: () => void;
}

export interface UsePostInputLockReturn {
  lockSwitch?: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    /** Disabled while the composer is empty — nothing to lock yet. */
    disabled: boolean;
  };
  /** The lock switch is on: this post must never be published as a normal, public post. */
  isLockEnabled: boolean;
  /** Lock Server the auth modal signs into; empty when unconfigured. */
  lockServerPubky: string;
  /** Whether the Locks sign-in modal is open (shown when the switch is on but not authenticated). */
  isAuthDialogOpen: boolean;
  closeAuthDialog: () => void;
  handleAuthSuccess: () => void;
  isLockDialogOpen: boolean;
  closeLockDialog: () => void;
  /** The unlock method is configured and the composer's Post button now publishes a locked post. */
  isLockConfigured: boolean;
  handleLockApplied: (password: string) => void;
  /** The content to be locked, captured when the switch went on. `null` while the switch is off. */
  lockDraft: TLockDraft | null;
  /** Title of the locked content, shown on the composer's "Locked post" card. */
  lockTitle: string;
  setLockTitle: (title: string) => void;
  /** Clears the lock state after a successful publish. The composer is emptied, not restored. */
  resetLock: () => void;
  /** The Lock Server rejected the session mid-publish: reopen sign-in, keep the switch on. */
  handleAuthExpired: () => void;
}
