import type { BuiltFile } from 'pubky-social-specs';
import type { Pubky } from '@/models/models.types';

/** One upload: where the media goes, its bytes, and what the post's attachment says about it. */
export interface TFileAttachmentResult {
  media: BuiltFile;
  bytes: Uint8Array;
  /** The picked file's name, stored on the post's attachment: v1 media has no metadata object. */
  name: string;
  contentType: string;
}

export type TFileAttachmentWithDataParams = {
  file: File;
  /** The media id `hashMedia` gave for `blobData`. */
  mediaId: string;
  blobData: Uint8Array;
  pubky: Pubky;
};
