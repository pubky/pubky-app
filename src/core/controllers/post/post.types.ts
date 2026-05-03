import type { TTagEventParams } from '@/controllers/tag/tag.types';
import type { Pubky } from '@/models/models.types';
import type { TCompositeId } from '@/services/nexus/post/post.types';

export interface TCreatePostParams {
  authorId: Pubky;
  content: string;
  isArticle?: boolean;
  tags?: string[];
  attachments?: File[];
  parentPostId?: string;
  originalPostId?: string;
}

export interface TDeletePostParams {
  compositePostId: string;
}

export interface TEditPostParams {
  compositePostId: string;
  content: string;
}

export interface TFileAttachmentsParams {
  attachments: File[];
  pubky: Pubky;
}

export interface TNormalizeTagsParams {
  tags: TTagEventParams[];
}

export interface TFetchMorePostTagsParams extends TCompositeId {
  skip?: number;
  limit?: number;
}

export interface TFetchPostTaggersParams extends TCompositeId {
  label: string;
  skip?: number;
  limit?: number;
  viewerId?: Pubky;
}
