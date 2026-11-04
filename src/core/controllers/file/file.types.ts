import type { Pubky } from '@/models/models.types';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
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

export type TCommitCreateAttachmentParams = {
  fileAttachment: TFileAttachmentResult;
};

export type TGetFileUrlParams = {
  // Composite ID: author:fileId
  fileId: string;
  /** The file's URI: a v1 file's route takes its `{hash}.{ext}` filename, which the composite id drops. */
  uri: string;
  variant: FileVariant;
};
