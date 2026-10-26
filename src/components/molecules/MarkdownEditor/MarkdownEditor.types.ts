/**
 * The article composer's inline media surface: images, videos, audio and PDFs are inserted the
 * same way (staged at insert time, referenced by an author-owned file URI, uploaded at publish).
 */
export interface MarkdownEditorInlineMedia {
  /**
   * MDXEditor's upload handler slot: validates a picked file and resolves with the
   * `pubky://…/files/{id}` URI the body references. The file is uploaded when the article is
   * published, not here.
   */
  upload: (file: File) => Promise<string>;
  /** Same-session object URL for a file URI, for in-editor previews */
  getPreviewUrl: (src: string) => string | null;
  /** MIME type of a file URI the composer knows (session file or edited post attachment); null otherwise */
  getMediaType: (uri: string) => string | null;
  /** File name of a URI the composer knows; the in-editor node is labelled with it. */
  getMediaName: (uri: string) => string | null;
}
