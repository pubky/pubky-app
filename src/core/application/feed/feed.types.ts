import type { Built, Feed, KnownPostKind } from 'pubky-social-specs';
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

/** One stored-feed write: the object to store at `feedUrl`, merged over what `storedUrl` holds. */
export interface StoredFeedWriteParams {
  /** Where the copy the write starts from lives: the feed being edited, or the new id itself on a create. */
  storedUrl: string;
  /** The private path of the feed being written. */
  feedUrl: string;
  /** The built feed, every known member from this client's input. */
  feed: Feed;
}

export interface PersistAndSyncParams extends StoredFeedWriteParams {
  feedSchema: FeedModelSchema;
}

export interface LocalFeedRowParams {
  id: string;
  feed: Feed;
  /** The content filter as a kind this client knows, already checked by the caller. */
  content: KnownPostKind | null;
  createdAt: number;
  updatedAt: number;
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
