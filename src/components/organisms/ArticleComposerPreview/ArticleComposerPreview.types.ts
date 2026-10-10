import type { ExistingAttachment } from '@/hooks/usePost/usePost.types';
import type { MarkdownEditorInlineMedia } from '@/molecules/MarkdownEditor/MarkdownEditor.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';

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
  /** The cover kept from the published article (edit); nothing renders for it until its URLs resolve. */
  coverAttachment?: ExistingAttachment;
  /** The composer session's lookups, so the preview renders the same bytes the editor shows. */
  inlineMedia: Pick<MarkdownEditorInlineMedia, 'getPreviewUrl' | 'getMediaType' | 'getMediaName'>;
  className?: string;
}
