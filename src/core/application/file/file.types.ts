import type { Pubky } from '@/models/models.types';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
export interface FilesListParams {
  fileAttachments: TFileAttachmentResult[];
}

export interface ReadFilesInput {
  fileUris: Pubky[];
}
