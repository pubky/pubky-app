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
  /** Called after each successful follow (e.g. to keep the card visible in an excludeFollowing list) */
  onFollowed?: (userId: Pubky) => void;
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
