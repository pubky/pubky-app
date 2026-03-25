import * as Core from '@/core';

export class FeedController {
  private constructor() {}

  /**
   * Get the list of feeds
   * @returns The list of feeds
   */
  static async getList(): Promise<Core.FeedModelSchema[]> {
    return Core.FeedApplication.getList();
  }

  /**
   * Get a feed by ID
   * @param feedId - The ID of the feed
   * @returns The feed or undefined if not found
   */
  static async get(params: Core.TFeedIdParam): Promise<Core.FeedModelSchema | undefined> {
    return Core.FeedApplication.get(params);
  }

  /**
   * Fetch all feeds from the homeserver and persist them locally.
   * @returns The list of persisted feeds
   */
  static async fetchFeeds(): Promise<Core.FeedModelSchema[]> {
    const userId = Core.useAuthStore.getState().selectCurrentUserPubky();
    return Core.FeedApplication.fetchFeeds(userId);
  }

  /**
   * Commit the create feed operation, this will persist the feed to the local database and sync to the homeserver.
   * @param params - The parameters object
   * @param params.tags - The tags for the feed
   * @returns The created feed
   */
  static async commitCreate(params: Core.TFeedCreateParams): Promise<Core.FeedModelSchema> {
    const userId = Core.useAuthStore.getState().selectCurrentUserPubky();

    // Validate tags early to fail fast before normalization and persistence
    Core.FeedValidators.validateTags(params.tags);

    const normalizedFeed = Core.FeedNormalizer.to({ params, userId });

    Core.FeedValidators.validatePutParams({ feed: normalizedFeed });

    const feed = await Core.FeedApplication.persist({ userId, params: { feed: normalizedFeed } });

    return feed!;
  }

  /**
   * Commit the update feed operation, this will persist the feed to the local database and sync to the homeserver.
   * @param params - The parameters object
   * @param params.feedId - The ID of the feed
   * @param params.changes - The changes to the feed
   * @returns The updated feed
   */
  static async commitUpdate(params: Core.TFeedUpdateParams): Promise<Core.FeedModelSchema> {
    const userId = Core.useAuthStore.getState().selectCurrentUserPubky();

    if (params.changes.tags) {
      Core.FeedValidators.validateTags(params.changes.tags);
    }

    const mergedParams = await Core.FeedApplication.prepareUpdateParams({
      feedId: params.feedId,
      changes: params.changes,
    });

    // Normalizing produces a new FeedResult whose ID is derived from the feed config
    // (tags, reach, layout, sort, content) via HashId — a blake3 hash of the serialized
    // PubkyAppFeedConfig. Changing any of those fields yields a different ID, which means
    // the homeserver path changes. The `name` and `created_at` fields are NOT part of the
    // hash, so renaming a feed keeps the same ID.
    const normalizedFeed = Core.FeedNormalizer.to({ params: mergedParams, userId });

    const persistParams: Core.TFeedPersistCreateParams = {
      feed: normalizedFeed,
      existingId: params.feedId,
    };

    Core.FeedValidators.validatePutParams(persistParams);

    // When the config-derived ID differs from existingId, persist handles the
    // create-new + delete-old cycle on the homeserver automatically.
    const feed = await Core.FeedApplication.persist({
      userId,
      params: persistParams,
    });

    return feed!;
  }

  /**
   * Commit the delete feed operation, this will delete the feed from the local database and sync to the homeserver.
   * @param params - The parameters object
   * @param params.feedId - The ID of the feed
   * @returns void
   */
  static async commitDelete(params: Core.TFeedIdParam): Promise<void> {
    const userId = Core.useAuthStore.getState().selectCurrentUserPubky();
    Core.FeedValidators.validateDeleteParams({ feedId: params.feedId });
    await Core.FeedApplication.commitDelete({ userId, params: { feedId: params.feedId } });
  }
}
