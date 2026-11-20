import type { BuiltPost } from 'pubky-social-specs';
import { HttpMethod } from '@/libs/http/http.types';

export interface TLocalSavePostParams {
  compositePostId: string;
  /** The built first version: where it goes and what it holds. */
  post: BuiltPost;
}

export interface TLocalUpdatePostStreamParams {
  compositePostId: string;
  kind: string;
  parentUri?: string;
  /** The post replies to an external resource (its `parent` is no post): only the author's replies list it. */
  isResourceReply?: boolean;
  lock?: string | null;
  ops: Promise<unknown>[];
  action: HttpMethod.PUT | HttpMethod.DELETE;
}
