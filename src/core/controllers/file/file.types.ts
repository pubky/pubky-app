import type { Pubky } from '@/models/models.types';
import type { FileVariant } from '@/services/nexus/file/file.types';

export type TUploadFileParams = {
  file: File;
  pubky: Pubky;
};

export type TDeleteFilesParams = {
  fileUris: string[];
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
