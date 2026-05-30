import { BlobResult, FileResult } from 'pubky-app-specs';
import type { Pubky } from '@/models/models.types';

export interface TFileAttachmentResult {
  blobResult: BlobResult;
  fileResult: FileResult;
}

export type TCreateBlobParams = {
  blobData: Uint8Array;
  pubky: Pubky;
};

export type TFileAttachmentWithDataParams = {
  file: File;
  blobData: Uint8Array;
  pubky: Pubky;
};

export type TToFileParams = {
  file: File;
  url: string;
  pubky: Pubky;
};
