import type { InlineNonImageMediaKind } from '@/libs/file/inlineMediaKind';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';

/** The part of a `file_details` row the reader needs to type and label an attachment slot. */
export type ArticleMediaFile = Pick<NexusFileDetails, 'uri' | 'content_type' | 'name'>;

/**
 * Where an article's `attachment:{n}` media comes from. The media type is never in the markdown:
 * a slot is typed from its file metadata (or the same-session local entry), unlocked content from
 * the bytes the reader holds, and an external URL from its file extension.
 */
export type ArticleMediaSource =
  | {
      /** The article post's full attachment URI list (`attachment:{n}` slots) */
      attachments: string[];
      /** The article author's pubky — attachment refs must resolve to files they own */
      authorId: string;
      /** Composite post id — local files store key for same-session previews */
      postId: string;
      /** `file_details` rows for the inline slots, matched by `uri` (never by index) */
      files: readonly ArticleMediaFile[];
      /** True once the metadata read for the inline slots settled, with or without a row per slot */
      metadataSettled: boolean;
    }
  | {
      /** Unlocked content: its files are in the reader's own `/priv`, not on the CDN. */
      localAttachments: AttachmentConstructed[];
    };

export type ArticleInlineMediaProps = ArticleMediaSource & {
  /** Markdown image destination, passed through raw by PostText's urlTransform */
  src?: string;
  alt?: string;
};

export type ResolvedArticleMedia =
  /** Rendered by `ArticleInlineImage`, which owns the image policy and placeholders */
  | { kind: 'image' }
  /** An attachment slot whose type is not known yet: reserve space, request nothing */
  | { kind: 'loading' }
  /** A slot of a known type the reader has no player for: a placeholder, no request */
  | { kind: 'unsupported' }
  /** A player or file card for a slot or external URL of a known non-image kind */
  | { kind: InlineNonImageMediaKind; url: string; name?: string; external: boolean };
