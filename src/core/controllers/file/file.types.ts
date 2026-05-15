import type { Pubky } from '@/models/models.types';
import type { FileVariant } from '@/services/nexus/file/file.types';

export type TUploadFileParams = {
  file: File;
  pubky: Pubky;
};

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

export type TGetMetadataParams = {
  fileAttachments: string[];
};

export type TFetchFilesParams = {
  fileUris: string[];
};

export type TGetFileUrlParams = {
  // Composite ID: author:fileId
  fileId: string;
  variant: FileVariant;
};
