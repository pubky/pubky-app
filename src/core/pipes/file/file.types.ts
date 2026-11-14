import type { BuiltFile } from 'pubky-social-specs';
import type { Pubky } from '@/models/models.types';

/** One upload: where the media goes, its bytes, and what the post's attachment says about it. */
export interface TFileAttachmentResult {
  media: BuiltFile;
  bytes: Uint8Array;
  /** The picked file's name, stored on the post's attachment: v1 media has no metadata object. */
  name: string;
  contentType: string;
  /**
   * What `FileApplication.commitCreate` learned before the PUT, read by a rollback of this upload
   * (`commitDeleteUploaded`). Three-valued: `true`, the homeserver already held these bytes (media
   * is content addressed, so another post may reference the same file) and a rollback leaves them
   * in place; `false`, this upload created the file and a rollback deletes it; unset, the probe
   * failed and nothing was PUT, so a rollback has nothing of this batch to clean and leaves the
   * file alone.
   */
  preexisting?: boolean;
}

export type TFileAttachmentWithDataParams = {
  file: File;
  /** The media id `hashMedia` gave for `blobData`. */
  mediaId: string;
  blobData: Uint8Array;
  pubky: Pubky;
};
