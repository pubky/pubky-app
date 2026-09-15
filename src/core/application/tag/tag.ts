import { TagKind, type TCreateTagListInput, type TDeleteTagInput } from '@/application/tag/tag.types';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import type { TLocalTagMutation, TLocalTagParams } from '@/services/local/tag/tag.types';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';
import { ViewerTagMarkerStorage } from '@/services/local/tag/viewerTagMarkerStorage';

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
  /** Recent local intent only; cached tag relationships are not mutation markers. */
  static getViewerMutation({ taggerId, taggedId, label }: TLocalTagParams) {
    return ViewerTagMarkerStorage.get({ pubky: taggerId, taggedId, label });
  }

  static subscribeViewerMutations(listener: (params: TLocalTagMutation) => void) {
    return ViewerTagMarkerStorage.subscribe(listener);
  }

  private static watchForNewerMutation({ taggerId, taggedId, label }: TLocalTagParams) {
    let isCurrent = true;
    // Local writes notify even when sessionStorage is unavailable. Keep this
    // guard until the request settles; marker expiry must not authorize rollback.
    const unsubscribe = ViewerTagMarkerStorage.subscribe((mutation) => {
      if (
        mutation.taggerId === taggerId &&
        mutation.taggedId === taggedId &&
        mutation.label.toLowerCase() === label.toLowerCase()
      ) {
        isCurrent = false;
      }
    });
    return { isCurrent: () => isCurrent, unsubscribe };
  }

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

      const mutation = this.watchForNewerMutation({ taggerId, taggedId, label });
      try {
        await HomeserverService.request({ method: HttpMethod.PUT, url: tagUrl, bodyJson: tagJson });
      } catch (error) {
        if (didCreateLocally && mutation.isCurrent()) {
          try {
            const restored =
              taggedKind === TagKind.POST
                ? await LocalPostTagService.delete({ taggerId, taggedId, label })
                : await LocalUserTagService.delete({ taggerId, taggedId, label });
            if (!restored && mutation.isCurrent()) {
              // A background refresh may already have restored the local row.
              // Still compensate our marker, without overwriting a newer toggle.
              ViewerTagMarkerStorage.set({ pubky: taggerId, taggedId, label, op: HttpMethod.DELETE });
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
      } finally {
        mutation.unsubscribe();
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
      const mutation = this.watchForNewerMutation({ taggerId, taggedId, label });
      try {
        await HomeserverService.request({ method: HttpMethod.DELETE, url: tagUrl });
      } catch (error) {
        // 404 means the tag is already gone on the homeserver. Local just made the
        // same change, so the two states match — accept the delete and skip rollback.
        // Without this, the rollback re-creates the tag locally and the user is left
        // with a "ghost" tag they can't remove (HS keeps returning 404).
        if (error instanceof AppError && error.code === ClientErrorCode.NOT_FOUND) {
          Logger.warn('[TagApplication.commitDelete] Homeserver returned 404; treating as already deleted', {
            taggedId,
            label,
            taggerId,
            taggedKind,
          });
          return;
        }

        // A newer toggle owns both the local row and marker; an older failed
        // request must not undo either of them.
        if (!mutation.isCurrent()) throw error;

        try {
          const restored =
            taggedKind === TagKind.POST
              ? await LocalPostTagService.create({ taggerId, taggedId, label })
              : await LocalUserTagService.create({ taggerId, taggedId, label });
          if (!restored && mutation.isCurrent()) {
            ViewerTagMarkerStorage.set({ pubky: taggerId, taggedId, label, op: HttpMethod.PUT });
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
      } finally {
        mutation.unsubscribe();
      }
    }
  }

  /**
   * Clears all viewer-mutation tag markers (sessionStorage) for the given user.
   * Called from logout / session-cleanup paths to drop stale markers before the
   * next user signs in on the same tab.
   */
  static clearViewerMarkers(pubky: Pubky) {
    ViewerTagMarkerStorage.clearForUser(pubky);
  }
}
