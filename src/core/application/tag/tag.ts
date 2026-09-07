import { TagKind, type TCreateTagListInput, type TDeleteTagInput } from '@/application/tag/tag.types';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import type { TLocalTagParams } from '@/services/local/tag/tag.types';
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

  static subscribeViewerMutations(listener: (params: TLocalTagParams) => void) {
    return ViewerTagMarkerStorage.subscribe(({ pubky, taggedId, label }) =>
      listener({ taggerId: pubky, taggedId, label }),
    );
  }

  private static ownsMutation(params: TLocalTagParams, expected: ReturnType<typeof ViewerTagMarkerStorage.get>) {
    const current = this.getViewerMutation(params);
    return !expected || !current || (current.ts === expected.ts && current.op === expected.op);
  }

  private static restoreMutationIfUnchanged(
    params: TLocalTagParams,
    expected: ReturnType<typeof ViewerTagMarkerStorage.get>,
    op: HttpMethod.PUT | HttpMethod.DELETE,
  ) {
    const current = this.getViewerMutation(params);
    if (expected && current?.ts === expected.ts && current.op === expected.op) {
      ViewerTagMarkerStorage.set({ pubky: params.taggerId, taggedId: params.taggedId, label: params.label, op });
    }
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

      const mutation = this.getViewerMutation({ taggerId, taggedId, label });
      try {
        await HomeserverService.request({ method: HttpMethod.PUT, url: tagUrl, bodyJson: tagJson });
      } catch (error) {
        if (didCreateLocally && this.ownsMutation({ taggerId, taggedId, label }, mutation)) {
          try {
            const restored =
              taggedKind === TagKind.POST
                ? await LocalPostTagService.delete({ taggerId, taggedId, label })
                : await LocalUserTagService.delete({ taggerId, taggedId, label });
            if (!restored) {
              // A background refresh may already have restored the local row.
              // Still compensate our marker, without overwriting a newer toggle.
              this.restoreMutationIfUnchanged({ taggerId, taggedId, label }, mutation, HttpMethod.DELETE);
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
      const mutation = this.getViewerMutation({ taggerId, taggedId, label });
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
        if (!this.ownsMutation({ taggerId, taggedId, label }, mutation)) throw error;

        try {
          const restored =
            taggedKind === TagKind.POST
              ? await LocalPostTagService.create({ taggerId, taggedId, label })
              : await LocalUserTagService.create({ taggerId, taggedId, label });
          if (!restored) {
            this.restoreMutationIfUnchanged({ taggerId, taggedId, label }, mutation, HttpMethod.PUT);
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

  /**
   * Clears all viewer-mutation tag markers (sessionStorage) for the given user.
   * Called from logout / session-cleanup paths to drop stale markers before the
   * next user signs in on the same tab.
   */
  static clearViewerMarkers(pubky: Pubky) {
    ViewerTagMarkerStorage.clearForUser(pubky);
  }
}
