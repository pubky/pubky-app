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
import type { TViewerTagMutationsParams } from '@/services/local/tag/tag.types';
import { LocalTagCacheService } from '@/services/local/tag/tag-cache';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';
import { NexusPostService } from '@/services/nexus/post/post';
import { NexusUserService } from '@/services/nexus/user/user';

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
      const mutationId = createTagMutationId();
      const params = { taggerId, taggedId, label, mutationId, isCurrent, tagUri: tagUrl };
      const changed = await local.create(params);
      if (isCurrent && !isCurrent()) return;
      try {
        await HomeserverService.request({ method: HttpMethod.PUT, url: tagUrl, bodyJson: tagJson });
      } catch (error) {
        if (changed && (!isCurrent || isCurrent())) {
          try {
            await local.delete({
              ...params,
              mutationId: createTagMutationId(),
              expectedMutationId: mutationId,
              synced: true,
            });
          } catch (rollbackError) {
            if (!isAppError(rollbackError))
              Logger.error('Failed to rollback local tag create', { taggedId, label, rollbackError });
          }
        }
        throw error;
      }
      if (changed)
        await LocalTagCacheService.completeMutation({ kind: taggedKind, id: taggedId }, { mutationId, isCurrent });
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
    const mutationId = createTagMutationId();
    const params = { taggerId, taggedId, label, mutationId, isCurrent };
    const changed = await local.delete(params);
    if (!changed || (isCurrent && !isCurrent())) return;
    try {
      tagUri ??= await this.fetchViewerTagUri({ taggerId, taggedId, label, taggedKind });
      if (isCurrent && !isCurrent()) return;
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
      if (!isCurrent || isCurrent()) {
        try {
          await local.create({
            ...params,
            mutationId: createTagMutationId(),
            expectedMutationId: mutationId,
            synced: true,
            tagUri,
          });
        } catch (rollbackError) {
          if (!isAppError(rollbackError))
            Logger.error('Failed to rollback local tag delete', { taggedId, label, rollbackError });
        }
      }
      throw error;
    }
    await LocalTagCacheService.completeMutation(entity, { mutationId, isCurrent });
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
