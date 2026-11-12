import { FeedApplication } from '@/application/feed/feed';
import type { TFeedPersistCreateParams } from '@/application/feed/feed.types';
import type { TFeedCreateParams, TFeedIdParam, TFeedUpdateParams } from '@/controllers/feed/feed.types';
import { captureViewerSession } from '@/controllers/tag/tag-cache.utils';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { FeedNormalizer } from '@/pipes/feed/feed.normalizer';
import { FeedValidators } from '@/pipes/feed/feed.validators';
import { useAuthStore } from '@/stores/auth/auth.store';

export class FeedController {
  private constructor() {}

  /**
   * Get the list of feeds
   * @returns The list of feeds
   */
  static async getList(): Promise<FeedModelSchema[]> {
    return FeedApplication.getList();
  }

  /**
   * Get a feed by ID
   * @param feedId - The ID of the feed
   * @returns The feed or undefined if not found
   */
  static async get(params: TFeedIdParam): Promise<FeedModelSchema | undefined> {
    return (await FeedApplication.get(params)) ?? undefined;
  }

  /**
   * Fetch all feeds from the homeserver and persist them locally. The listing is reconciled under
   * the viewer guard, so a fetch that outlives a sign-out writes nothing for the next account.
   * @returns The list of persisted feeds
   */
  static async fetchFeeds(): Promise<FeedModelSchema[]> {
    const userId = useAuthStore.getState().selectCurrentUserPubky();
    return FeedApplication.fetchFeeds(userId, { isCurrent: captureViewerSession() });
  }

  /**
   * Commit the create feed operation, this will persist the feed to the local database and sync to the homeserver.
   * @param params - The parameters object
   * @param params.tags - The tags for the feed
   * @returns The created feed, or null when the account changed while the write waited for the sync lock
   *   (nothing was created)
   */
  static async commitCreate(params: TFeedCreateParams): Promise<FeedModelSchema | null> {
    const userId = useAuthStore.getState().selectCurrentUserPubky();

    // Validate tag scope early to fail fast before normalization and persistence.
    FeedValidators.validateTagScope(params.tags, params.domain_tags, params.reach);

    const normalizedFeed = FeedNormalizer.to({ params, userId });

    FeedValidators.validatePutParams({ feed: normalizedFeed });

    return FeedApplication.persist({ userId, params: { feed: normalizedFeed }, isCurrent: captureViewerSession() });
  }

  /**
   * Commit the update feed operation, this will persist the feed to the local database and sync to the homeserver.
   * @param params - The parameters object
   * @param params.feedId - The ID of the feed
   * @param params.changes - The changes to the feed
   * @returns The updated feed, or null when the account changed while the write waited for the sync lock
   *   (nothing was updated)
   */
  static async commitUpdate(params: TFeedUpdateParams): Promise<FeedModelSchema | null> {
    const userId = useAuthStore.getState().selectCurrentUserPubky();
    // Captured with the user, before the local read below: a logout during that read must turn the guard false.
    const isCurrent = captureViewerSession();

    const mergedParams = await FeedApplication.prepareUpdateParams({
      feedId: params.feedId,
      changes: params.changes,
    });

    FeedValidators.validateTagScope(mergedParams.tags, mergedParams.domain_tags, mergedParams.reach);

    // Normalizing produces a new built feed whose ID is derived from the feed config
    // (tags, domain_tags, reach, layout, sort, content). Changing any of those fields yields a different ID, which means
    // the homeserver path changes. The `name`, `icon`, and `created_at` fields are NOT
    // part of the hash, so presentation-only changes keep the same ID.
    const normalizedFeed = FeedNormalizer.to({ params: mergedParams, userId });

    const persistParams: TFeedPersistCreateParams = {
      feed: normalizedFeed,
      existingId: params.feedId,
    };

    FeedValidators.validatePutParams(persistParams);

    // When the config-derived ID differs from existingId, persist handles the
    // create-new + delete-old cycle on the homeserver automatically.
    return FeedApplication.persist({ userId, params: persistParams, isCurrent });
  }

  /**
   * Commit the delete feed operation, this will delete the feed from the local database and sync to the homeserver.
   * @param params - The parameters object
   * @param params.feedId - The ID of the feed
   * @returns void; a delete skipped because the account changed while it waited for the sync lock resolves like
   *   a completed one (the viewer is gone, and the next sign-in lists what the homeserver holds)
   */
  static async commitDelete(params: TFeedIdParam): Promise<void> {
    const userId = useAuthStore.getState().selectCurrentUserPubky();
    FeedValidators.validateDeleteParams({ feedId: params.feedId });
    await FeedApplication.commitDelete({
      userId,
      params: { feedId: params.feedId },
      isCurrent: captureViewerSession(),
    });
  }
}
