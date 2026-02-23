import LinkifyIt from 'linkify-it';
import { PubkyAppPostKind } from 'pubky-app-specs';

type TInferPostKindParams = {
  content: string;
  attachments?: File[];
  isArticle?: boolean;
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
