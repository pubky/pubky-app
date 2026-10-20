import type { NexusPostDetails } from '@/services/nexus/nexus.types';

// The id of the model is composed of the author and the id
// authorId:postId
export type PostDetailsModelSchema = Omit<NexusPostDetails, 'author'> & {
  /** Most recent local collection write; Nexus cache reads do not advance it. */
  localUpdatedAt?: number;
};

// Keep only the primary key index. Post details are read by composite id.
export const postDetailsTableSchema = `
  &id
`;
