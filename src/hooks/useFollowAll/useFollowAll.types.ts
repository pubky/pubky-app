import type { Pubky } from '@/models/models.types';

export interface FollowAllTarget {
  id: Pubky;
  /** Whether the viewer already follows this user; such targets are skipped */
  isFollowing?: boolean;
}

export interface FollowAllProgress {
  /** Targets processed so far (successes + failures) */
  completed: number;
  /** Targets that were not already followed when the run started */
  total: number;
}

export interface FollowAllResult {
  followed: Pubky[];
  failed: Pubky[];
  /** Targets skipped because the viewer already followed them */
  skipped: Pubky[];
}

export interface UseFollowAllOptions {
  /**
   * Called right before each follow is committed, so an `excludeFollowing` list can preserve the
   * card before the local write lands and the relationships live query would otherwise drop it.
   */
  onFollowStarted?: (userId: Pubky) => void;
  /** Called when a follow failed, to undo whatever `onFollowStarted` set up for that user. */
  onFollowFailed?: (userId: Pubky) => void;
}

export interface UseFollowAllResult {
  /**
   * Follow every target the viewer does not follow yet, sequentially. Never rejects: failures
   * are collected in the result and surfaced through a single summary toast.
   */
  followAll: (targets: FollowAllTarget[]) => Promise<FollowAllResult>;
  isRunning: boolean;
  progress: FollowAllProgress;
}
