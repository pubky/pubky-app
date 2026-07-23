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
  /** The announcement (public teaser) composer state, published once the lock is configured. */
  announcementContent: string;
  announcementAttachments: File[];
  announcementTags: string[];
  /** Clears the announcement's tags after a successful publish (they belonged to the announcement). */
  clearTags: () => void;
  /** Called with the new announcement post id after a successful publish. */
  onPublished?: (postId: string) => void;
  /** The normal (non-lock) submit path, run when the switch is off. */
  onNormalSubmit: () => void;
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
  /** The unlock method was applied (Apply Lock): the announcement form and its "Locked post" card show. */
  isLockConfigured: boolean;
  /** Lock Server the auth modal signs into; empty when unconfigured. */
  lockServerPubky: string;
  /** Whether the Locks sign-in modal is open (shown when the switch is on but not authenticated). */
  isAuthDialogOpen: boolean;
  closeAuthDialog: () => void;
  handleAuthSuccess: () => void;
  isLockDialogOpen: boolean;
  closeLockDialog: () => void;
  handleLockApplied: (password: string) => void;
  /** Title of the locked content, shown on the composer's "Locked post" card. */
  lockTitle: string;
  setLockTitle: (title: string) => void;
  /**
   * The composer's Post button handler: publishes the locked content (switch on + configured),
   * publishes nothing (switch on, not yet configured), or runs the normal submit (switch off).
   */
  submitOrPublish: () => Promise<void>;
  /** A lock publish is in flight — disables the Post button and counts as submitting. */
  isPublishing: boolean;
}
