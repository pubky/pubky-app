import * as Core from '@/core';

export type TUploadFileParams = {
  file: File;
  pubky: Core.Pubky;
};

export type TToFileParams = {
  file: File;
  url: string;
  pubky: Core.Pubky;
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
  variant: Core.FileVariant;
};
