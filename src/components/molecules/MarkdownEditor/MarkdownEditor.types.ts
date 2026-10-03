/**
 * The article composer's inline media surface: images, videos, audio and PDFs are inserted the
 * same way (uploaded at insert time, referenced by their homeserver file URI).
 */
export interface MarkdownEditorInlineMedia {
  /** Uploads a picked file and resolves with its `pubky://…/files/{id}` URI */
  upload: (file: File) => Promise<string>;
  /** Same-session object URL for a file URI, for in-editor previews */
  getPreviewUrl: (src: string) => string | null;
  /** MIME type of a file URI the composer knows (session upload or edited post attachment); null otherwise */
  getMediaType: (uri: string) => string | null;
  uploadingCount?: number;
}
