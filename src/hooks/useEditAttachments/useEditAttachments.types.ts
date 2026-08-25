import type { Dispatch, SetStateAction } from 'react';
import type { ExistingAttachment } from '@/hooks/usePost/usePost.types';

export interface UseEditAttachmentsOptions {
  /** Only active for the EDIT composer variant. */
  enabled: boolean;
  /** Composite post ID (author:postId) — the local files store key. */
  postId?: string;
  /** The post's current attachment URIs, in display order. */
  uris?: string[];
  existingAttachments: ExistingAttachment[];
  setExistingAttachments: Dispatch<SetStateAction<ExistingAttachment[]>>;
}

export interface UseEditAttachmentsReturn {
  /**
   * The URI list the composer was seeded from (set once, at seed time).
   * `undefined` until seeding happens. Submit-time change detection compares
   * the kept list against this snapshot, never against the live post row.
   */
  seededUris: string[] | undefined;
}
