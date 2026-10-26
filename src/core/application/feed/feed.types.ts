import type { Built, Feed } from 'pubky-social-specs';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import type { Pubky } from '@/models/models.types';

export interface FeedDeleteParams {
  userId: string;
  params: TFeedPersistParams;
}

export interface FeedUpdateParams {
  userId: string;
  params: TFeedPersistUpdateParams;
}

export interface FeedPutParams {
  userId: string;
  params: TFeedPersistParams;
}

export interface PersistAndSyncParams {
  feedSchema: FeedModelSchema;
  feedUrl: string;
  body: Uint8Array;
}

export interface LocalFeedMigrationParams {
  userId: Pubky;
  existingId: string;
  feedSchema: FeedModelSchema;
  oldFeed: FeedModelSchema | null;
}

export type TFeedPersistCreateParams = {
  feed: Built<Feed>;
  existingId?: string;
};

export type TFeedPersistUpdateParams = {
  feedId: string;
  changes: Partial<Omit<TFeedCreateParams, 'name'>>;
};

export type TFeedPersistDeleteParams = {
  feedId: string;
};

export type TFeedPersistParams = TFeedPersistCreateParams | TFeedPersistUpdateParams | TFeedPersistDeleteParams;

export type TFeedPersistInput = {
  action: HttpMethod;
  userId: Pubky;
  params: TFeedPersistParams;
};

export function isFeedDeleteParams(params: TFeedPersistParams): params is TFeedPersistDeleteParams {
  return 'feedId' in params && !('changes' in params) && !('feed' in params);
}

export function isFeedUpdateParams(params: TFeedPersistParams): params is TFeedPersistUpdateParams {
  return 'feedId' in params && 'changes' in params;
}
