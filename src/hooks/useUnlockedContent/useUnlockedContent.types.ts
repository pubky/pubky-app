import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import type { GuardedPost, LockFile, TUnlockedContent } from '@/services/locks/locks.types';

export interface UseUnlockedContentParams {
  /** The post's top-level `lock` URL. */
  lock: string | null | undefined;
  /** The resolved lock file (null while loading), used to detect the creator's own lock. */
  lockFile: LockFile | null;
  /** Post author (pubky.app account). */
  authorId: string;
}

export interface UseUnlockedContentResult {
  /** Accessible post (own lock, prior unlock, or a just-completed unlock), or null while locked. */
  unlockedPost: GuardedPost | null;
  /** Swap in a just-completed unlock and replicate it into the reader's `/priv` (best-effort). */
  applyUnlockedContent: (content: TUnlockedContent) => void;
  /** The current post's attachments as object-URL media, revoked on change/unmount. */
  media: AttachmentConstructed[];
  /** Whether the signed-in user is the lock's creator (owns the guarded storage). */
  isOwnLock: boolean;
}
