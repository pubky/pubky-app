import {
  TagKind,
  type TCreateTagListInput,
  type TCreateTagResult,
  type TDeleteTagInput,
} from '@/application/tag/tag.types';
import { createTagMutationId } from '@/application/tag/tag.utils';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { isAppError } from '@/libs/error/error.utils';
import { HttpStatusCode } from '@/libs/http/http.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { canonicalJson, sha256Hex } from '@/libs/pubchi/schemas/canonical';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { retryHomeserverWriteAfterReread } from '@/services/homeserver/write-retry';
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

  static async commitCreate({ tagList, isCurrent, preserveExisting = false }: TCreateTagListInput) {
    const results: TCreateTagResult[] = [];
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
        const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
        const result = await this.enqueueWrite(tagUrl, async () => {
          fence.assertCurrent();
          if (isCurrent && !isCurrent()) return undefined;
          if (!preserveExisting) {
            await this.writeFixedTag(HttpMethod.PUT, tagUrl, tagJson);
            return { tagUrl, alreadyExisted: false };
          }
          return retryHomeserverWriteAfterReread(fence, async () => {
            if (isCurrent && !isCurrent()) return undefined;
            let bodyJson = tagJson;
            let existed = false;
            if (preserveExisting) {
              try {
                const raw = await HomeserverService.requestRawText(tagUrl);
                if (new TextEncoder().encode(raw).byteLength > 64 * 1024) {
                  throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag document is too large', {
                    service: ErrorService.Homeserver,
                    operation: 'commitCreate',
                  });
                }
                let remote: unknown;
                try {
                  remote = JSON.parse(raw);
                } catch (cause) {
                  throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Tag document is invalid', {
                    service: ErrorService.Homeserver,
                    operation: 'commitCreate',
                    cause,
                  });
                }
                if (
                  !remote ||
                  typeof remote !== 'object' ||
                  Array.isArray(remote) ||
                  !('uri' in remote) ||
                  !('label' in remote) ||
                  !('created_at' in remote) ||
                  remote.uri !== tagJson.uri ||
                  remote.label !== tagJson.label
                ) {
                  throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag identity mismatch', {
                    service: ErrorService.Homeserver,
                    operation: 'commitCreate',
                  });
                }
                bodyJson = { ...tagJson, ...remote };
                existed = true;
              } catch (error) {
                if (!hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) throw error;
              }
            }
            if (isCurrent && !isCurrent()) return undefined;
            const tagDocumentSha256 = preserveExisting ? await sha256Hex(canonicalJson(bodyJson)) : undefined;
            await HomeserverService.request({ method: HttpMethod.PUT, url: tagUrl, bodyJson, fence });
            return { tagUrl, alreadyExisted: existed, ...(tagDocumentSha256 && { tagDocumentSha256 }) };
          });
        });
        if (result === undefined) {
          if (changed) await this.undo(local, 'create', write);
          return undefined;
        }
        results.push(result);
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
    return results.length === 1 ? results[0] : results;
  }

  static async materializeForDelete({
    taggerId,
    taggedId,
    label,
    taggedKind,
    isCurrent,
  }: Omit<TDeleteTagInput, 'tagUrl'>): Promise<void> {
    if (isCurrent && !isCurrent()) return;
    const local = taggedKind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
    await local.create({ taggerId, taggedId, label, mutationId: createTagMutationId(), synced: true, isCurrent });
  }

  static async commitDelete({ taggerId, taggedId, label, tagUrl, taggedKind, isCurrent }: TDeleteTagInput) {
    return this.deleteTag({ taggerId, taggedId, label, tagUrl, taggedKind, isCurrent });
  }

  /** Assisted undo never authorizes deleting a replacement document at the same tag URL. */
  static async commitDeleteIfUnchanged(params: TDeleteTagInput, expectedHash: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag application has no verifiable document proof', {
        service: ErrorService.Pubchi,
        operation: 'revertTagSuggestion',
      });
    }
    return this.deleteTag(params, expectedHash);
  }

  private static async deleteTag(
    { taggerId, taggedId, label, tagUrl, taggedKind, isCurrent }: TDeleteTagInput,
    expectedHash?: string,
  ): Promise<void> {
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
      const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
      const completed = await this.enqueueWrite(tagUrl, async () => {
        fence.assertCurrent();
        if (isCurrent && !isCurrent()) return false;
        if (!expectedHash) {
          await this.writeFixedTag(HttpMethod.DELETE, tagUrl);
          return true;
        }
        return retryHomeserverWriteAfterReread(fence, async () => {
          if (isCurrent && !isCurrent()) return false;
          if (expectedHash) {
            const raw = await HomeserverService.requestRawText(tagUrl);
            if (new TextEncoder().encode(raw).byteLength > 64 * 1024) {
              throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag document exceeds the verification limit', {
                service: ErrorService.Pubchi,
                operation: 'revertTagSuggestion',
              });
            }
            let remote: unknown;
            try {
              remote = JSON.parse(raw);
            } catch (cause) {
              throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Tag document cannot be verified for undo', {
                service: ErrorService.Pubchi,
                operation: 'revertTagSuggestion',
                cause,
              });
            }
            if ((await sha256Hex(canonicalJson(remote))) !== expectedHash) {
              throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag changed since this suggestion was applied', {
                service: ErrorService.Pubchi,
                operation: 'revertTagSuggestion',
              });
            }
          }
          await HomeserverService.request({ method: HttpMethod.DELETE, url: tagUrl, fence });
          return true;
        });
      });
      if (!completed) {
        await this.undo(local, 'delete', write);
        return;
      }
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

  private static readonly pendingWrites = new Map<string, Promise<unknown>>();

  /** Hold ordering across the whole read/check/retry, while optimistic UI updates stay immediate. */
  private static async enqueueWrite<T>(tagUrl: string, write: () => Promise<T>): Promise<T> {
    const previous = this.pendingWrites.get(tagUrl);
    const pending = previous ? previous.catch(() => {}).then(write) : write();
    this.pendingWrites.set(tagUrl, pending);
    try {
      return await pending;
    } finally {
      if (this.pendingWrites.get(tagUrl) === pending) this.pendingWrites.delete(tagUrl);
    }
  }

  /** Ordinary actions have a fixed body; HomeserverService owns their retries. */
  private static async writeFixedTag(
    method: HttpMethod.PUT | HttpMethod.DELETE,
    url: string,
    bodyJson?: Record<string, unknown>,
  ): Promise<void> {
    await HomeserverService.request({ method, url, ...(bodyJson && { bodyJson }) });
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
