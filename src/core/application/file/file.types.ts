import type { Pubky } from '@/models/models.types';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';

export interface FilesListParams {
  fileAttachments: TFileAttachmentResult[];
}

export interface ReadFilesInput {
  fileUris: Pubky[];
}

/** A v1 media file a delete considers: its URI and its composite id (`owner:hash`). */
export interface TMediaFile {
  uri: string;
  fileId: string;
}
