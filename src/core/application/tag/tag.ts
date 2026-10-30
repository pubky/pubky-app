import { TagKind, type TCreateTagListInput, type TDeleteTagInput } from '@/application/tag/tag.types';
import { createTagMutationId } from '@/application/tag/tag.utils';
import type { TTagEventParams } from '@/controllers/tag/tag.types';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import type { TLocalTagParams, TViewerTagMutationsParams } from '@/services/local/tag/tag.types';
import { LocalTagCacheService } from '@/services/local/tag/tag-cache';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';
import { NexusPostService } from '@/services/nexus/post/post';
import { NexusUserService } from '@/services/nexus/user/user';

type TLocalTagService = typeof LocalPostTagService | typeof LocalUserTagService;
type TTagWrite = Pick<TLocalTagParams, 'taggerId' | 'taggedId' | 'label' | 'mutationId' | 'tagUri'>;

/** Optimistic writes and conditional compensation share their operation ID in IndexedDB. */
export class TagApplication {
  static getViewerMutations({ taggedKind, taggedId, taggerId }: TViewerTagMutationsParams) {
    return LocalTagCacheService.getViewerMutations({ kind: taggedKind, id: taggedId }, taggerId);
  }

  static async commitCreate({ tagList, isCurrent }: TCreateTagListInput) {
    // Sequential: a failed entry leaves no hidden in-flight writes for later tags.
    for (const { taggerId, taggedId, label, tagUrl, tagJson, taggedKind } of tagList) {
      if (isCurrent && !isCurrent()) return;
      const local = taggedKind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
      // The create records the URL it writes, so a delete can find it before Nexus reports it.
      const write = { taggerId, taggedId, label, mutationId: createTagMutationId(), tagUri: tagUrl };
      const changed = await local.create({ ...write, isCurrent });
      if (isCurrent && !isCurrent()) {
        if (changed) await this.undo(local, 'create', write);
        return;
      }
      try {
        await HomeserverService.request({ method: HttpMethod.PUT, url: tagUrl, bodyJson: tagJson });
      } catch (error) {
        if (changed) await this.undo(local, 'create', write);
        throw error;
      }
      if (changed)
        await LocalTagCacheService.completeMutation(
          { kind: taggedKind, id: taggedId },
          { mutationId: write.mutationId, isCurrent },
        );
    }
  }

  static async commitDelete({ taggerId, taggedId, label, taggedKind, isCurrent, canWrite }: TDeleteTagInput) {
    if (isCurrent && !isCurrent()) return;
    const local = taggedKind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
    const entity = { kind: taggedKind, id: taggedId };
    // Read the address before the optimistic delete clears the viewer's local tag.
    let tagUri = TagNormalizer.toOwnTagUri(
      await LocalTagCacheService.getViewerTagUri(entity, label, taggerId),
      taggerId,
    );
    const write = { taggerId, taggedId, label, mutationId: createTagMutationId() };
    const changed = await local.delete({ ...write, isCurrent });
    if (!changed) return;
    if (isCurrent && !isCurrent()) {
      await this.undo(local, 'delete', { ...write, tagUri });
      return;
    }
    try {
      if (!tagUri) {
        tagUri = await this.fetchViewerTagUri({ taggerId, taggedId, label, taggedKind });
        if (isCurrent && !isCurrent()) {
          await this.undo(local, 'delete', { ...write, tagUri });
          return;
        }
        // A re-add that landed while Nexus was asked owns the label now, and its PUT is already queued ahead
        // of this request: a DELETE sent after it would remove the tag the viewer just put back.
        if (!(await LocalTagCacheService.ownsMutation(entity, label, taggerId, write.mutationId))) return;
      }
      // Nexus reporting no tag, like an already absent homeserver record, agrees with the optimistic deletion.
      if (tagUri) {
        if (canWrite && !canWrite(tagUri)) {
          throw Err.auth(AuthErrorCode.FORBIDDEN, 'The session cannot write the app folder of this tag', {
            service: ErrorService.Local,
            operation: 'commitDelete',
            context: { taggedKind, taggedId, taggerId },
          });
        }
        await HomeserverService.request({ method: HttpMethod.DELETE, url: tagUri }).catch((error: unknown) => {
          if (!(error instanceof AppError && error.code === ClientErrorCode.NOT_FOUND)) throw error;
        });
      }
    } catch (error) {
      // The restored tag keeps the address that failed, so the next attempt needs no Nexus round trip.
      await this.undo(local, 'delete', { ...write, tagUri });
      throw error;
    }
    await LocalTagCacheService.completeMutation(entity, { mutationId: write.mutationId, isCurrent });
  }

  /**
   * Undo an optimistic write the homeserver never accepted. The undo is bound to that write by
   * `expectedMutationId`, never to the session fence: a 401 ends the session before its rejection
   * reaches the caller, and a database cleared for another account holds no such operation.
   */
  private static async undo(local: TLocalTagService, write: 'create' | 'delete', params: TTagWrite) {
    try {
      await local[write === 'create' ? 'delete' : 'create']({
        taggerId: params.taggerId,
        taggedId: params.taggedId,
        label: params.label,
        mutationId: createTagMutationId(),
        expectedMutationId: params.mutationId,
        synced: true,
        tagUri: params.tagUri,
      });
    } catch (rollbackError) {
      if (!isAppError(rollbackError))
        Logger.error(`Failed to rollback local tag ${write}`, {
          taggedId: params.taggedId,
          label: params.label,
          rollbackError,
        });
    }
  }

  /**
   * Nexus reports where the viewer's tag file lives, whichever app folder wrote it, or `undefined` when the
   * viewer no longer tags the label.
   */
  private static async fetchViewerTagUri({ taggerId, taggedId, label, taggedKind }: TTagEventParams) {
    const { tag_uri, relationship } =
      taggedKind === TagKind.POST
        ? await NexusPostService.getPostTaggers({
            compositeId: taggedId,
            label,
            limit: 1,
            viewerId: taggerId,
            notFoundRetries: 0,
          })
        : await NexusUserService.taggers({
            user_id: taggedId,
            label,
            limit: 1,
            viewer_id: taggerId,
            notFoundRetries: 0,
          });
    if (!relationship) return undefined;
    const tagUri = TagNormalizer.toOwnTagUri(tag_uri, taggerId);
    if (!tagUri) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Nexus did not return the viewer tag address', {
        service: ErrorService.Nexus,
        operation: 'fetchViewerTagUri',
        context: { taggedKind, taggedId, taggerId },
      });
    }
    return tagUri;
  }
}
