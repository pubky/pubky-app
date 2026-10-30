import { PubkyAppPostKind } from 'pubky-app-specs';
import { isOneOf, type KnownPostKind, postKinds } from 'pubky-social-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { getFirstLinkUrl } from '@/libs/post/postLinkUrl';
import { isVideoUrl } from '@/libs/utils/videoUrl';
import type { PostKind } from '@/models/models.types';

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

const getAttachmentKind = (contentTypes: string[]): PubkyAppPostKind | null => {
  if (contentTypes.some((type) => type.startsWith('video/'))) {
    return PubkyAppPostKind.Video;
  }

  if (contentTypes.some((type) => type.startsWith('image/'))) {
    return PubkyAppPostKind.Image;
  }

  if (contentTypes.length > 0) {
    return PubkyAppPostKind.File;
  }

  return null;
};

/**
 * Shared tail of kind inference, applied after the callers' own guards
 * (article on create, article/collection preservation on edit):
 * video URL in content → Video, other URL in content → Link, else attachment
 * media kind, else Short.
 */
const inferContentKind = (content: string, attachmentContentTypes: string[]): PubkyAppPostKind => {
  const url = getFirstLinkUrl(content);
  if (url) {
    return isVideoUrl(url) ? PubkyAppPostKind.Video : PubkyAppPostKind.Link;
  }

  return getAttachmentKind(attachmentContentTypes) ?? PubkyAppPostKind.Short;
};

export const inferPostKindForCreate = ({ content, attachments, isArticle }: TInferPostKindParams): PubkyAppPostKind => {
  if (isArticle) {
    return PubkyAppPostKind.Long;
  }

  return inferContentKind(
    content,
    (attachments ?? []).map((file) => file.type),
  );
};

/**
 * Kind for an edited post whose attachment set changed. Articles and
 * collections keep their kind; everything else re-runs the create-time
 * inference against the resulting attachment content types.
 */
export const inferPostKindForEdit = ({
  content,
  attachmentContentTypes,
  currentKind,
}: TInferPostKindForEditParams): PubkyAppPostKind => {
  if (currentKind === 'long') {
    return PubkyAppPostKind.Long;
  }

  if (currentKind === 'collection') {
    return PubkyAppPostKind.Collection;
  }

  return inferContentKind(content, attachmentContentTypes);
};

/** Kinds a lock post's public announcement may never use — it is a short teaser, not the content. */
const KINDS_FORBIDDEN_FOR_ANNOUNCEMENT = new Set<PubkyAppPostKind>([
  PubkyAppPostKind.Long,
  PubkyAppPostKind.Collection,
]);

/**
 * Kind of the public announcement that advertises a lock.
 *
 * The announcement is a teaser, so `long` and `collection` are rejected outright — the locked content
 * behind it may still be either. Today the composer hides the article button while the lock switch is
 * on, which already rules `long` out; this guard keeps that from breaking silently if the UI changes.
 */
export const inferAnnouncementKind = (params: TInferPostKindParams): PubkyAppPostKind => {
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
 * Nexus serves the 0.x kind names (`short`, `long`) for every post while it reads both epochs, and
 * the local tables keep what Nexus serves. A stored v1 post uses `note` and `article`. These two
 * functions are the only crossing between the vocabularies.
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
