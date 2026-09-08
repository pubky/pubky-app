/**
 * Inline-image support for the article editor. When provided, the rich-text
 * mode gains an image toolbar button plus native paste/drop upload (via
 * MDXEditor's image plugin), and the raw-markdown mode gains an image toolbar
 * button plus custom paste/drop handlers on the textarea.
 */
export interface MarkdownEditorInlineImages {
  /**
   * Uploads the image and resolves with the homeserver file URI to insert.
   * Rejections must be user-visible already (toast) — the editor inserts
   * nothing and stays silent.
   */
  upload: (file: File) => Promise<string>;
  /** Local preview URL for a file URI uploaded this session, if any */
  getPreviewUrl: (src: string) => string | null;
  /**
   * Uploads currently in flight. Drives the rich-text-mode uploading
   * indicator — paste/drop there have no dialog or placeholder, so this is
   * the only visible feedback during the upload.
   */
  uploadingCount?: number;
}
