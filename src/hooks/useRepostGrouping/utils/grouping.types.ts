import type { Pubky, PostDetailsModelSchema, PostRelationshipsModelSchema } from '@/core';

export interface PostData {
  postId: string;
  details: PostDetailsModelSchema | undefined;
  relationships: PostRelationshipsModelSchema | undefined;
  originalPostId: string | null;
  reposterPubky: Pubky;
}

export interface PlainRepostsResult {
  byOriginalPost: Map<string, PostData[]>;
  postIds: Set<string>;
}
