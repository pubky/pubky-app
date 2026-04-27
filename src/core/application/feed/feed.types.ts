import * as Core from '@/core';
import { FeedResult } from 'pubky-app-specs';
import { HttpMethod } from '@/libs/http/http.types';

export interface FeedDeleteParams {
  userId: string;
  params: Core.TFeedPersistParams;
}

export interface FeedUpdateParams {
  userId: string;
  params: Core.TFeedPersistUpdateParams;
}

export interface FeedPutParams {
  userId: string;
  params: Core.TFeedPersistParams;
}

export interface PersistAndSyncParams {
  userId: string;
  feedSchema: Core.FeedModelSchema;
  normalizedFeed: FeedResult;
}

export interface LocalFeedMigrationParams {
  existingId: string;
  feedSchema: Core.FeedModelSchema;
  oldFeed: Core.FeedModelSchema | null;
}

export type TFeedPersistCreateParams = {
  feed: FeedResult;
  existingId?: string;
};

export type TFeedPersistUpdateParams = {
  feedId: string;
  changes: Partial<Omit<Core.TFeedCreateParams, 'name'>>;
};

export type TFeedPersistDeleteParams = {
  feedId: string;
};

export type TFeedPersistParams = TFeedPersistCreateParams | TFeedPersistUpdateParams | TFeedPersistDeleteParams;

export type TFeedPersistInput = {
  action: HttpMethod;
  userId: Core.Pubky;
  params: TFeedPersistParams;
};

export interface RemoteFeedParams {
  userId: Core.Pubky;
  remoteFeed: HomeserverFeedJson;
}

export interface HomeserverFeedJson {
  name: string;
  feed: {
    tags?: string[];
    reach: string;
    layout: string;
    sort: string;
    content: string | null;
  };
  created_at: number;
}

export function isFeedDeleteParams(params: TFeedPersistParams): params is TFeedPersistDeleteParams {
  return 'feedId' in params && !('changes' in params) && !('feed' in params);
}

export function isFeedUpdateParams(params: TFeedPersistParams): params is TFeedPersistUpdateParams {
  return 'feedId' in params && 'changes' in params;
}
