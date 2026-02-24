import { feedUriBuilder } from 'pubky-app-specs';
import * as Core from '@/core';
import type { FeedDeleteParams, FeedPutParams, PersistAndSyncParams } from './feed.types';
import { HttpMethod } from '@/libs';

export class FeedApplication {
  private constructor() {}

  static async getList(): Promise<Core.FeedModelSchema[]> {
    return Core.LocalFeedService.readAll();
  }

  static async get(params: Core.TFeedIdParam): Promise<Core.FeedModelSchema> {
    return Core.LocalFeedService.read(params);
  }

  static async persist({ userId, params }: FeedPutParams): Promise<Core.FeedModelSchema> {
    const { feed: normalizedFeed, existingId } = params as Core.TFeedPersistCreateParams;
    const { feed, meta } = normalizedFeed;
    const newId = meta.id;
    const idChanged = existingId != null && existingId !== newId;

    const now = Date.now();
    const createdAt = existingId
      ? (await Core.LocalFeedService.read({ feedId: existingId }).catch(() => ({ created_at: now }))).created_at
      : now;

    const { tags, reach, sort, content, layout } = feed.feed;

    const feedSchema: Core.FeedModelSchema = {
      id: newId,
      name: feed.name,
      tags: tags ?? [],
      reach,
      sort,
      content: content ?? null,
      layout,
      created_at: createdAt,
      updated_at: now,
    };

    // When config fields (tags, reach, layout, sort, content) change, the HashId-derived
    // ID changes too. The old resource must be removed before creating the new one.
    if (idChanged) {
      await this.commitDelete({ userId, params: { feedId: existingId } });
    }

    return this.commit({ userId, feedSchema, normalizedFeed });
  }

  static async commitDelete({ userId, params }: FeedDeleteParams): Promise<void> {
    const feedUrl = feedUriBuilder(userId, (params as Core.TFeedPersistDeleteParams).feedId);

    await Promise.all([
      Core.LocalFeedService.delete({ feedId: (params as Core.TFeedPersistDeleteParams).feedId }),
      Core.HomeserverService.request({ method: HttpMethod.DELETE, url: feedUrl }),
    ]);
  }

  /**
   * Merges partial update changes with the existing feed to produce a full TFeedCreateParams.
   * Fields present in `changes` override the existing values; omitted fields keep their current value.
   * The result is passed to FeedNormalizer which recomputes the HashId — if any config field
   * (tags, reach, sort, content, layout) changed, the feed will get a new ID.
   */
  static async prepareUpdateParams({ feedId, changes }: Core.TFeedUpdateParams): Promise<Core.TFeedCreateParams> {
    const existing = await Core.LocalFeedService.read({ feedId });

    return {
      name: existing.name,
      tags: changes.tags ?? existing.tags,
      reach: changes.reach ?? existing.reach,
      sort: changes.sort ?? existing.sort,
      content: changes.content !== undefined ? changes.content : existing.content,
      layout: changes.layout ?? existing.layout,
    };
  }

  /**
   * Persist feed locally and sync to homeserver
   * Extracted to avoid duplication between handlePut and handleUpdate
   */
  private static async commit({
    userId,
    feedSchema,
    normalizedFeed,
  }: PersistAndSyncParams): Promise<Core.FeedModelSchema> {
    
    const persistedFeed = await Core.LocalFeedService.createOrUpdate(feedSchema);

    const feedUrl = feedUriBuilder(userId, persistedFeed.id);
    const feedJson: Record<string, unknown> = normalizedFeed.feed.toJson();

    await Core.HomeserverService.request({ method: HttpMethod.PUT, url: feedUrl, bodyJson: feedJson });

    return persistedFeed;
  }
}
