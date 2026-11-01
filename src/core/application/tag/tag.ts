import { TagKind, type TCreateTagListInput, type TDeleteTagInput } from '@/application/tag/tag.types';
import { createTagMutationId } from '@/application/tag/tag.utils';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { isAppError } from '@/libs/error/error.utils';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import type { TLocalTagParams, TViewerTagMutationsParams } from '@/services/local/tag/tag.types';
import { LocalTagCacheService } from '@/services/local/tag/tag-cache';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';

type TLocalTagService = typeof LocalPostTagService | typeof LocalUserTagService;
type TTagWrite = Pick<TLocalTagParams, 'taggerId' | 'taggedId' | 'label' | 'mutationId'>;

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
      const write = { taggerId, taggedId, label, mutationId: createTagMutationId() };
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

  static async commitDelete({ taggerId, taggedId, label, tagUrl, taggedKind, isCurrent }: TDeleteTagInput) {
    if (isCurrent && !isCurrent()) return;
    const local = taggedKind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
    const write = { taggerId, taggedId, label, mutationId: createTagMutationId() };
    const changed = await local.delete({ ...write, isCurrent });
    if (!changed) return;
    if (isCurrent && !isCurrent()) {
      await this.undo(local, 'delete', write);
      return;
    }
    try {
      await HomeserverService.request({ method: HttpMethod.DELETE, url: tagUrl });
    } catch (error) {
      // An already absent homeserver record agrees with the optimistic deletion.
      if (!(error instanceof AppError && error.code === ClientErrorCode.NOT_FOUND)) {
        await this.undo(local, 'delete', write);
        throw error;
      }
    }
    await LocalTagCacheService.completeMutation(
      { kind: taggedKind, id: taggedId },
      { mutationId: write.mutationId, isCurrent },
    );
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
}
