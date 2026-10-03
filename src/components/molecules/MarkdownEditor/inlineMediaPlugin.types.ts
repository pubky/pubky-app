import type { InlineNonImageMediaKind } from '@/libs/file/inlineMediaKind';

/** The insert/edit dialog state for non-image inline media; images keep MDXEditor's `imageDialogState$`. */
export type InlineMediaDialogState =
  | { type: 'inactive' }
  | { type: 'new'; mediaKind: InlineNonImageMediaKind }
  | {
      type: 'editing';
      mediaKind: InlineNonImageMediaKind;
      nodeKey: string;
      initialValues: { src: string; altText: string; title?: string };
    };

export interface InlineMediaPluginParams {
  /** Uploads a picked file and resolves with its `pubky://…/files/{id}` URI (the same handler images use). */
  uploadHandler: (file: File) => Promise<string>;
  /** MIME type of a file URI known to the composer session or the edited post; null for anything else. */
  getMediaType: (uri: string) => string | null;
  /** Same-session object URL for a file URI, so a fresh upload previews before the CDN has it. */
  getPreviewUrl: (uri: string) => string | null;
}

export interface SaveInlineMediaParams {
  src: string;
  altText: string;
  title?: string;
  mediaKind: InlineNonImageMediaKind;
}
