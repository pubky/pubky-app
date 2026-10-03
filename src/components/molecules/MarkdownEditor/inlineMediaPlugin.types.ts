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

/** Uploads go through `imagePlugin`'s `imageUploadHandler`, the one handler every kind shares. */
export interface InlineMediaPluginParams {
  /** MIME type of a file URI known to the composer session or the edited post; null for anything else. */
  getMediaType: (uri: string) => string | null;
  /** A URL a browser can load for a file URI (the session's object URL, else the CDN); null for anything else. */
  getPreviewUrl: (uri: string) => string | null;
}

export interface SaveInlineMediaParams {
  src: string;
  altText: string;
  title?: string;
  mediaKind: InlineNonImageMediaKind;
}
