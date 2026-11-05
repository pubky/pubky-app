import type { Pubky } from '@/models/models.types';

/** One event read from a homeserver event stream; the cursor resumes the stream after it. */
export type THomeserverEvent = {
  cursor: string;
  eventType: string;
  /** Absolute storage path of the changed resource, e.g. `/pub/pubky.app/last_read`. */
  path: string;
};

export type TSubscribeUserEventStreamParams = {
  pubky: Pubky;
  cursor: string | null;
  /** Union of path filters: a trailing slash matches a directory subtree, otherwise one exact file. */
  paths: readonly string[];
  /** Aborting it cancels the stream, including one that resolves after the abort. */
  signal: AbortSignal;
};
