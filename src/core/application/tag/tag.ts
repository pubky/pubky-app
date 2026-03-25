import * as Core from '@/core';
import { HttpMethod, Logger } from '@/libs';

/**
 * Tag application service implementing local-first architecture with rollback.
 *
 * **Local-First Write Pattern:**
 * Both `create` and `delete` methods update the local IndexedDB first, then
 * synchronize with the homeserver. This keeps the UI responsive while still
 * compensating locally if the homeserver request fails.
 *
 * **Failure Handling:**
 * If the homeserver request fails after the local update, the failed write is
 * rolled back locally so counters and relationship state stay consistent with
 * Nexus.
 */
export class TagApplication {
  /**
   * Commits the create tag operation to the homeserver and local database.
   * @param tagList - The list of tags to create
   */
  static async commitCreate({ tagList }: Core.TCreateTagListInput) {
    // Process tags one at a time so callers never observe hidden in-flight work
    // from later entries after an earlier tag fails.
    for (const { taggerId, taggedId, label, tagUrl, tagJson, taggedKind } of tagList) {
      let didCreateLocally = false;

      if (taggedKind === Core.TagKind.POST) {
        didCreateLocally = await Core.LocalPostTagService.create({ taggerId, taggedId, label });
      } else {
        didCreateLocally = await Core.LocalUserTagService.create({ taggerId, taggedId, label });
      }

      try {
        await Core.HomeserverService.request({ method: HttpMethod.PUT, url: tagUrl, bodyJson: tagJson });
      } catch (error) {
        if (didCreateLocally) {
          try {
            if (taggedKind === Core.TagKind.POST) {
              await Core.LocalPostTagService.delete({ taggerId, taggedId, label });
            } else {
              await Core.LocalUserTagService.delete({ taggerId, taggedId, label });
            }
          } catch (rollbackError) {
            Logger.error('[TagApplication.commitCreate] Failed to rollback local tag create', {
              taggedId,
              label,
              taggerId,
              taggedKind,
              rollbackError,
            });
          }
        }

        throw error;
      }
    }
  }

  /**
   * Commits the delete tag operation to the homeserver and local database.
   * @param params - The parameters object
   * @param params.taggerId - The ID of the user who is deleting the tag
   * @param params.taggedId - The ID of the post or user who is being tagged
   * @param params.label - The label of the tag
   * @param params.tagUrl - The URL of the tag
   * @param params.taggedKind - The kind of the tagged entity
   */
  static async commitDelete({ taggerId, taggedId, label, tagUrl, taggedKind }: Core.TDeleteTagInput) {
    let wasDeleted = false;

    if (taggedKind === Core.TagKind.POST) {
      wasDeleted = await Core.LocalPostTagService.delete({ taggerId, taggedId, label });
    } else {
      wasDeleted = await Core.LocalUserTagService.delete({ taggerId, taggedId, label });
    }

    // Only send to homeserver if something was actually deleted locally
    if (wasDeleted) {
      try {
        await Core.HomeserverService.request({ method: HttpMethod.DELETE, url: tagUrl });
      } catch (error) {
        try {
          if (taggedKind === Core.TagKind.POST) {
            await Core.LocalPostTagService.create({ taggerId, taggedId, label });
          } else {
            await Core.LocalUserTagService.create({ taggerId, taggedId, label });
          }
        } catch (rollbackError) {
          Logger.error('[TagApplication.commitDelete] Failed to rollback local tag delete', {
            taggedId,
            label,
            taggerId,
            taggedKind,
            rollbackError,
          });
        }

        throw error;
      }
    }
  }
}
