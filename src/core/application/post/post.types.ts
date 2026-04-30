import { PubkyAppPost } from 'pubky-app-specs';
import type { TCreateTagInput } from '@/application/tag/tag.types';
import type { Pubky } from '@/models/models.types';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import type { TLocalSavePostParams } from '@/services/local/post/post.types';
export interface TCreatePostInput extends TLocalSavePostParams {
  postUrl: string;
  fileAttachments?: TFileAttachmentResult[];
  tags?: TCreateTagInput[];
}

export interface TEditPostInput {
  compositePostId: string;
  post: PubkyAppPost;
  postUrl: string;
}

export type TGetOrFetchPostParams = {
  compositeId: string;
  /** Optional viewer ID for relationship data. Null/undefined for unauthenticated views. */
  viewerId?: Pubky | null;
};
