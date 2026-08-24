import LinkifyIt from 'linkify-it';
import { PubkyAppPostKind } from 'pubky-app-specs';

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
 * URL in content → Link, else attachment media kind, else Short.
 */
const inferContentKind = (content: string, attachmentContentTypes: string[]): PubkyAppPostKind => {
  if (hasSupportedUrl(content)) {
    return PubkyAppPostKind.Link;
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
