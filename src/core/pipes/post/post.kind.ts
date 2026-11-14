import { isOneOf, type KnownPostKind, postKinds } from 'pubky-social-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { getFirstLinkUrl } from '@/libs/post/postLinkUrl';
import { isVideoUrl } from '@/libs/utils/videoUrl';
import type { PostKind } from '@/models/models.types';
import type { TLockContentKind } from '@/services/locks/locks.types';

type TInferPostKindParams = {
  content: string;
  attachments?: File[];
  isArticle?: boolean;
};

type TInferPostKindForEditParams = {
  content: string;
  /** MIME content types of the resulting attachment set (kept + added). */
  attachmentContentTypes: string[];
  /** Stored lowercase kind of the post being edited. */
  currentKind: string;
};

type TResolveTagTargetCompositeIdParams = {
  authorId: string;
  newPostId: string;
  originalPostId?: string;
  content: string;
  attachments?: File[];
};

const getAttachmentKind = (contentTypes: string[]): KnownPostKind | null => {
  if (contentTypes.some((type) => type.startsWith('video/'))) {
    return 'video';
  }

  if (contentTypes.some((type) => type.startsWith('image/'))) {
    return 'image';
  }

  if (contentTypes.length > 0) {
    return 'file';
  }

  return null;
};

/**
 * Shared tail of kind inference, applied after the callers' own guards
 * (article on create, article/collection preservation on edit):
 * video URL in content → video, other URL in content → link, else attachment
 * media kind, else note. The result is the stored (v1) kind name; the local
 * tables keep Nexus's `short`/`long` through `toLocalPostKind`.
 */
const inferContentKind = (content: string, attachmentContentTypes: string[]): KnownPostKind => {
  const url = getFirstLinkUrl(content);
  if (url) {
    return isVideoUrl(url) ? 'video' : 'link';
  }

  return getAttachmentKind(attachmentContentTypes) ?? 'note';
};

export const inferPostKindForCreate = ({ content, attachments, isArticle }: TInferPostKindParams): KnownPostKind => {
  if (isArticle) {
    return 'article';
  }

  return inferContentKind(
    content,
    (attachments ?? []).map((file) => file.type),
  );
};

/**
 * The pubky-social-specs v1.0.0-rc.1 name a lock announcement saves for the kind of its locked post (#2433). An
 * explicit mapping, so the stored names stay fixed when the internal kinds are renamed. A `Record` over every
 * `KnownPostKind`, so a kind added by a specs upgrade fails to compile until it is mapped here. A create never
 * infers a collection, so it saves nothing and reads as generic content.
 */
const LOCK_CONTENT_KIND_BY_POST_KIND: Record<KnownPostKind, TLockContentKind | undefined> = {
  note: 'note',
  article: 'article',
  image: 'image',
  video: 'video',
  link: 'link',
  file: 'file',
  collection: undefined,
};

export const toLockContentKind = (kind: KnownPostKind): TLockContentKind | undefined =>
  LOCK_CONTENT_KIND_BY_POST_KIND[kind];

/**
 * Kind for an edited post whose attachment set changed. Articles and
 * collections keep their kind; everything else re-runs the create-time
 * inference against the resulting attachment content types.
 */
export const inferPostKindForEdit = ({
  content,
  attachmentContentTypes,
  currentKind,
}: TInferPostKindForEditParams): KnownPostKind => {
  if (currentKind === 'long') {
    return 'article';
  }

  if (currentKind === 'collection') {
    return 'collection';
  }

  return inferContentKind(content, attachmentContentTypes);
};

/** Kinds a lock post's public announcement may never use — it is a short teaser, not the content. */
const KINDS_FORBIDDEN_FOR_ANNOUNCEMENT = new Set<KnownPostKind>(['article', 'collection']);

/**
 * Kind of the public announcement that advertises a lock.
 *
 * The announcement is a teaser, so an article and a collection are rejected outright — the locked
 * content behind it may still be either. Today the composer hides the article button while the lock
 * switch is on, which already rules an article out; this guard keeps that from breaking silently if
 * the UI changes.
 */
export const inferAnnouncementKind = (params: TInferPostKindParams): KnownPostKind => {
  const kind = inferPostKindForCreate(params);
  if (KINDS_FORBIDDEN_FOR_ANNOUNCEMENT.has(kind)) {
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, `A lock announcement cannot be a ${kind} post`, {
      service: ErrorService.Local,
      operation: 'inferAnnouncementKind',
      context: { kind },
    });
  }
  return kind;
};

/**
 * Where post tags should be stored on create. For a simple repost (no text, no attachments),
 * tags apply to the embedded original post; for a quote repost (text and/or attachment), they apply to the new post.
 */
export const resolveTagTargetCompositeIdForPostCreate = ({
  authorId,
  newPostId,
  originalPostId,
  content,
  attachments,
}: TResolveTagTargetCompositeIdParams): string => {
  const newCompositeId = `${authorId}:${newPostId}`;
  if (!originalPostId) {
    return newCompositeId;
  }

  const hasAttachments = (attachments?.length ?? 0) > 0;
  const isSimpleRepost = !content.trim() && !hasAttachments;

  if (isSimpleRepost) {
    return originalPostId;
  }

  return newCompositeId;
};

/**
 * The local tables and the stream ids keep the 0.x kind names (`short`, `long`), which Nexus `/v0`
 * served and which 120 read sites compare against (D16). A stored v1 post, and Nexus `/v1`, use
 * `note` and `article`. These two functions are the only crossing between the vocabularies; the
 * read boundary (`toLocalPostKindFromNexus`) and the stream filter (`toNexusPostKindFilter`) are
 * spelled through them.
 */
export const toLocalPostKind = (kind: KnownPostKind): PostKind =>
  kind === 'note' ? 'short' : kind === 'article' ? 'long' : kind;

/**
 * The stored v1 kind of a local kind. Fails closed: `null` for a kind this client cannot write
 * back (`unknown`, or a name neither vocabulary has), so a caller never stores a guess.
 */
export const toStoredPostKind = (kind: string): KnownPostKind | null => {
  const normalized = kind.toLowerCase();
  if (normalized === 'short' || normalized === 'note') return 'note';
  if (normalized === 'long' || normalized === 'article') return 'article';
  return isOneOf(postKinds, normalized) ? normalized : null;
};

/**
 * The local kind of a kind Nexus serves. `/v1` spells the stored names (`note`, `article`), so every
 * Nexus post read crosses here before the kind is stored or compared: the Nexus services
 * (`PostNormalizer.fromNexus`, `NotificationNormalizer`) and the server-side metadata read
 * (`fetchUserAndPostForMetadata`), which fetches outside the services. Fails open: `unknown`, and any
 * name neither vocabulary has, is kept as served, so such a post still renders (as a note, today's
 * fall-through) and is never hidden; it cannot be written back, since `toStoredPostKind` fails closed.
 */
export const toLocalPostKindFromNexus = (kind: string): string => {
  const stored = toStoredPostKind(kind);
  return stored === null ? kind : toLocalPostKind(stored);
};

/**
 * The `kind=` a Nexus `/v1` stream or content-search filter takes: the stored name of a local stream
 * kind (`short` → `note`, `long` → `article`, the rest unchanged). The `StreamKind` values and the
 * persisted stream ids (`timeline:all:short`) keep the local names; only the URL builders cross. A
 * name neither vocabulary has is sent as is, for Nexus to reject.
 */
export const toNexusPostKindFilter = (kind: string): string => toStoredPostKind(kind) ?? kind;
