import { TagKind, type TCreateTagListInput, type TDeleteTagInput } from '@/application/tag/tag.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';

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
  static async commitCreate({ tagList }: TCreateTagListInput) {
    // Process tags one at a time so callers never observe hidden in-flight work
    // from later entries after an earlier tag fails.
    for (const { taggerId, taggedId, label, tagUrl, tagJson, taggedKind } of tagList) {
      let didCreateLocally = false;

      if (taggedKind === TagKind.POST) {
        didCreateLocally = await LocalPostTagService.create({ taggerId, taggedId, label });
      } else {
        didCreateLocally = await LocalUserTagService.create({ taggerId, taggedId, label });
      }

      try {
        await HomeserverService.request({ method: HttpMethod.PUT, url: tagUrl, bodyJson: tagJson });
      } catch (error) {
        if (didCreateLocally) {
          try {
            if (taggedKind === TagKind.POST) {
              await LocalPostTagService.delete({ taggerId, taggedId, label });
            } else {
              await LocalUserTagService.delete({ taggerId, taggedId, label });
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
  static async commitDelete({ taggerId, taggedId, label, tagUrl, taggedKind }: TDeleteTagInput) {
    let wasDeleted = false;

    if (taggedKind === TagKind.POST) {
      wasDeleted = await LocalPostTagService.delete({ taggerId, taggedId, label });
    } else {
      wasDeleted = await LocalUserTagService.delete({ taggerId, taggedId, label });
    }

    // Only send to homeserver if something was actually deleted locally
    if (wasDeleted) {
      try {
        await HomeserverService.request({ method: HttpMethod.DELETE, url: tagUrl });
      } catch (error) {
        try {
          if (taggedKind === TagKind.POST) {
            await LocalPostTagService.create({ taggerId, taggedId, label });
          } else {
            await LocalUserTagService.create({ taggerId, taggedId, label });
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
