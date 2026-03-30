import * as Core from '@/core';

// The id of the model is composed of the author and the id
// authorId:postId
export type PostDetailsModelSchema = Omit<Core.NexusPostDetails, 'author'>;

// Keep only the primary key index. Post details are read by composite id.
export const postDetailsTableSchema = `
  &id
`;
