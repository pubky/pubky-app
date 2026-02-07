import * as Core from '@/core';
import { PubkyAppPostKind } from 'pubky-app-specs';

export interface TCreatePostParams {
  authorId: Core.Pubky;
  content: string;
  kind?: PubkyAppPostKind;
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
  pubky: Core.Pubky;
}

export interface TNormalizeTagsParams {
  tags: Core.TTagEventParams[];
}

export interface TFetchMorePostTagsParams extends Core.TCompositeId {
  skip?: number;
  limit?: number;
}

export interface TFetchPostTaggersParams extends Core.TCompositeId {
  label: string;
  skip?: number;
  limit?: number;
  viewerId?: Core.Pubky;
}
