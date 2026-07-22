import type { LockFile, TGuardedResource, TUnlockedContent } from '@/services/locks/locks.types';

/** Params for the reader unlock flow. `lockUrl` is the post's public `lock.json` URL. */
export type TUnlockContentParams = {
  lockFile: LockFile;
  lockUrl: string;
  password: string;
};

/** Params for reading the guarded content after unlock, authorized by `credential`. */
export type TFetchUnlockedContentParams = {
  lockFile: LockFile;
  credential: string;
};

/** Params to copy unlocked content into the reader's own `/priv` (the only write of the three). */
export type TReplicateUnlockedContentParams = {
  lockUrl: string;
  readerPubky: string;
  content: TUnlockedContent;
};

export type TFetchReplicatedContentParams = {
  lockUrl: string;
  readerPubky: string;
};

export type TFetchOwnContentParams = {
  lockFile: LockFile;
};

/**
 * One file to guard. The storage path is minted per upload, so the original filename is not part of
 * it — carry that name as metadata inside the post JSON, like a normal post's `PubkyAppFile.name`.
 */
export type TLockContentFile = {
  contentType: string;
  bytes: Uint8Array;
};

/**
 * Params to publish one content lock, in pubky-app terms: a post and its attachments. The
 * application maps them onto the Lock Server's primary/secondary resource vocabulary.
 *
 * The Lock Server is not passed in — it is read off the session, which is the only server holding the
 * uploaded bytes. The post is not passed either: an attachment's path only exists once its bytes are
 * uploaded, and the post has to reference them, so the caller supplies a builder that runs after the
 * attachments land.
 */
export type TCreateLockContentParams = {
  /** Attachments (images, video, …). Uploaded first, so `buildPost` can reference their paths. */
  attachments?: TLockContentFile[];
  /**
   * Builds the JSON file holding the `PubkyAppPost` object from the uploaded attachment descriptors.
   * Called with an empty array when there are no attachments. `ownerPubky` is the account the guarded
   * bytes landed on (from the upload response); the post references its attachments by that host.
   * It is undefined only when there are no attachments (and so no URIs to build).
   */
  buildPost: (attachmentResources: TGuardedResource[], ownerPubky?: string) => TLockContentFile;
};
