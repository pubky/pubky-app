import { TagKind, type TCreateTagListInput, type TDeleteTagInput } from '@/application/tag/tag.types';
import { createTagMutationId } from '@/application/tag/tag.utils';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { isAppError } from '@/libs/error/error.utils';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import type { TViewerTagMutationsParams } from '@/services/local/tag/tag.types';
import { LocalTagCacheService } from '@/services/local/tag/tag-cache';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';

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
      const params = { taggerId, taggedId, label, mutationId, isCurrent };
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

  static async commitDelete({ taggerId, taggedId, label, tagUrl, taggedKind, isCurrent }: TDeleteTagInput) {
    if (isCurrent && !isCurrent()) return;
    const local = taggedKind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
    const mutationId = createTagMutationId();
    const params = { taggerId, taggedId, label, mutationId, isCurrent };
    const changed = await local.delete(params);
    if (!changed || (isCurrent && !isCurrent())) return;
    try {
      await HomeserverService.request({ method: HttpMethod.DELETE, url: tagUrl });
    } catch (error) {
      // An already absent homeserver record agrees with the optimistic deletion.
      if (!(error instanceof AppError && error.code === ClientErrorCode.NOT_FOUND)) {
        if (!isCurrent || isCurrent()) {
          try {
            await local.create({
              ...params,
              mutationId: createTagMutationId(),
              expectedMutationId: mutationId,
              synced: true,
            });
          } catch (rollbackError) {
            if (!isAppError(rollbackError))
              Logger.error('Failed to rollback local tag delete', { taggedId, label, rollbackError });
          }
        }
        throw error;
      }
    }
    await LocalTagCacheService.completeMutation({ kind: taggedKind, id: taggedId }, { mutationId, isCurrent });
  }
}
