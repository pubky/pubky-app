import type { NexusFileDetails } from '@/services/nexus/nexus.types';

// File details schema based on Nexus file metadata
// The id is the file URI (Pubky)
export type FileDetailsModelSchema = NexusFileDetails & {
  /**
   * One id per upload of these bytes by this device (any tab) that has not been rolled back: a
   * rollback deletes the file only when no other upload still claims it (`FileApplication.commitDeleteUploaded`).
   * Local bookkeeping, never from Nexus, and unindexed.
   */
  upload_claims?: string[];
};

export const fileDetailsTableSchema = `
  &id
`;
