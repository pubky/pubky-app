import type {
  LockFile,
  ReplicatedPost,
  TGuardedResource,
  TLockPrice,
  TUnlockedContent,
  TVerificationStatus,
  TVerificationTask,
} from '@/services/locks/locks.types';

/** A payment lock as seen by one reader: the lock file, its public URL, and the reader. */
export type TPaymentLockParams = {
  lockUrl: string;
  readerPubky: string;
  lockFile: LockFile;
};

/**
 * `isRetry`: the reader pressed Try again (or I completed the steps). Only then may an ended id be
 * replaced by a fresh one: an automatic start that waited behind another submission can find its id
 * ended (the reader rejected it in Bitkit), and replacing it would send a request nobody asked for.
 */
export type TStartPaymentParams = TPaymentLockParams & { isRetry: boolean };

/**
 * The saved bundle id a payment continues with, by the Lock Server's view of every id the reader
 * saved for the lock. `reusable` carries the task (null when the server never received the
 * submission). `terminal` means every saved id ended `failed`/`expired`, so only a fresh one can pay.
 * `region-blocked` means the Lock Server refused to look the saved ids up (HTTP 451): their state is
 * unknown, and so is whether anything can be done from here.
 */
export type TResolvedPurchase =
  | { kind: 'reusable'; bundleId: string; task: TVerificationTask | null }
  | { kind: 'terminal'; bundleId: string; status: 'failed' | 'expired' }
  | { kind: 'region-blocked' };

/**
 * The bundle id and lifecycle status returned by proof submission, or the ended one an automatic start
 * found. `regionBlocked` means the Lock Server refused the submission (HTTP 451) because paid unlocks are
 * not available in the reader's region, on the submission or on the lookup of a saved id: no payment was
 * created, and the saved bundle id stays reusable. The id is absent when the refusal came from the lookup.
 */
export type TStartPaymentResult =
  { bundleId: string; status: TVerificationStatus; regionBlocked?: false } | { bundleId?: string; regionBlocked: true };

/** A submitted payment: the lock file and the bundle id the proof was submitted with. */
export type TPaymentBundleParams = {
  lockFile: LockFile;
  bundleId: string;
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
  /**
   * `pubky://…/posts/<id>` of the announcement. Written into the reader's own replica marker, never
   * into `lock.json` — the Lock Server contract is untouched by this.
   */
  announcementUri: string;
};

export type TFetchReplicatedContentParams = {
  lockUrl: string;
  readerPubky: string;
};

export type TFetchUnlockedListParams = {
  readerPubky: string;
};

export type TFetchReplicatedAttachmentsParams = {
  post: ReplicatedPost;
};

export type TFetchOwnContentParams = {
  lockUrl: string;
  lockFile: LockFile;
};

/** The creator's price, in the selected denomination's smallest unit. */
export type TLockConfig = TLockPrice;

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
  /** How the content is gated. The criterion is assembled from it at publish time. */
  lockConfig: TLockConfig;
};
