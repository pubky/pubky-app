import LinkifyIt from 'linkify-it';
import { PubkyAppPostKind } from 'pubky-app-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

type TInferPostKindParams = {
  content: string;
  attachments?: File[];
  isArticle?: boolean;
};

type TResolveTagTargetCompositeIdParams = {
  authorId: string;
  newPostId: string;
  originalPostId?: string;
  content: string;
  attachments?: File[];
};

// Keep these aligned with PostLinkEmbeds so we treat links consistently.
const IGNORED_PROTOCOLS = ['ftp:', 'mailto:'];

const stripMarkdownLinks = (content: string): string => {
  return content.replace(/\[([^\]]*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '<stripped-link>');
};

const hasSupportedUrl = (content: string): boolean => {
  const linkify = new LinkifyIt();
  IGNORED_PROTOCOLS.forEach((protocol) => linkify.add(protocol, null));

  const strippedContent = stripMarkdownLinks(content);
  const match = linkify.match(strippedContent);

  return Boolean(match?.[0]?.url);
};

const getAttachmentKind = (attachments: File[]): PubkyAppPostKind | null => {
  if (attachments.some((file) => file.type.startsWith('video/'))) {
    return PubkyAppPostKind.Video;
  }

  if (attachments.some((file) => file.type.startsWith('image/'))) {
    return PubkyAppPostKind.Image;
  }

  if (attachments.length > 0) {
    return PubkyAppPostKind.File;
  }

  return null;
};

export const inferPostKindForCreate = ({ content, attachments, isArticle }: TInferPostKindParams): PubkyAppPostKind => {
  if (isArticle) {
    return PubkyAppPostKind.Long;
  }

  if (hasSupportedUrl(content)) {
    return PubkyAppPostKind.Link;
  }

  const files = attachments ?? [];
  const attachmentKind = getAttachmentKind(files);

  if (attachmentKind !== null) {
    return attachmentKind;
  }

  return PubkyAppPostKind.Short;
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
