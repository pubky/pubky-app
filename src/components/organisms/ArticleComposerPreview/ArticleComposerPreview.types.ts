import type { MarkdownEditorInlineMedia } from '@/molecules/MarkdownEditor/MarkdownEditor.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';

/** A cover already persisted on the article being edited, resolved to a renderable URL. */
export interface ArticleComposerPreviewCover {
  src: string;
  alt: string;
  /** MIME type: the published renderer only treats an image slot as a cover. */
  type: string;
}

export interface ArticleComposerPreviewProps {
  title: string;
  /** The body as the composer holds it: inline media referenced by their homeserver file URIs. */
  body: string;
  /** The author of the draft; the serializer only maps the files they own to attachment slots. */
  authorPubky: string;
  /** Profile of the author, for the byline. */
  userDetails?: NexusUserDetails | null;
  /** A cover picked this session. Wins over `coverAttachment` when both are set. */
  coverFile?: File;
  /** The cover kept from the published article (edit). */
  coverAttachment?: ArticleComposerPreviewCover | null;
  /** The composer session's lookups, so the preview renders the same bytes the editor shows. */
  inlineMedia: Pick<MarkdownEditorInlineMedia, 'getPreviewUrl' | 'getMediaType' | 'getMediaName'>;
  className?: string;
}
