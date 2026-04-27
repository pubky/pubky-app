import { PubkyAppPost } from 'pubky-app-specs';
import { HttpMethod } from '@/libs/http/http.types';

export interface TLocalSavePostParams {
  compositePostId: string;
  post: PubkyAppPost;
}

export interface TLocalUpdatePostStreamParams {
  compositePostId: string;
  kind: string;
  parentUri?: string;
  ops: Promise<unknown>[];
  action: HttpMethod.PUT | HttpMethod.DELETE;
}
