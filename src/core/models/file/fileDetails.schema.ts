import type { NexusFileDetails } from '@/services/nexus/nexus.types';

// File details schema based on Nexus file metadata
// The id is the file URI (Pubky)
export type FileDetailsModelSchema = NexusFileDetails;

export const fileDetailsTableSchema = `
  &id
`;
