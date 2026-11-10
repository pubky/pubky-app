import {
  TagKind,
  type TCreateTagListInput,
  type TCreateTagResult,
  type TDeleteTagInput,
} from '@/application/tag/tag.types';
import { createTagMutationId } from '@/application/tag/tag.utils';
import type { TTagEventParams } from '@/controllers/tag/tag.types';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { isAppError } from '@/libs/error/error.utils';
import { HttpStatusCode } from '@/libs/http/http.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { canonicalJson, sha256Hex } from '@/libs/pubchi/schemas/canonical';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { retryHomeserverWriteAfterReread } from '@/services/homeserver/write-retry';
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

  static async commitCreate({ tagList, isCurrent, preserveExisting = false }: TCreateTagListInput) {
    const results: TCreateTagResult[] = [];
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
  }: Omit<TDeleteTagInput, 'canWrite'>): Promise<void> {
    if (isCurrent && !isCurrent()) return;
    const local = taggedKind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
    await local.create({ taggerId, taggedId, label, mutationId: createTagMutationId(), synced: true, isCurrent });
  }

  static async commitDelete(params: TDeleteTagInput) {
    return this.deleteTag(params);
  }

  /** Assisted undo checks the exact file written by the suggestion, never a replacement app's file. */
  static async commitDeleteIfUnchanged(
    params: TDeleteTagInput & { tagUrl: string },
    expectedHash: string,
  ): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag application has no verifiable document proof', {
        service: ErrorService.Pubchi,
        operation: 'revertTagSuggestion',
      });
    }
    return this.deleteTag(params, { tagUrl: params.tagUrl, expectedHash });
  }

  private static async deleteTag(
    { taggerId, taggedId, label, taggedKind, isCurrent, canWrite }: TDeleteTagInput,
    proof?: { tagUrl: string; expectedHash: string },
  ): Promise<void> {
    if (isCurrent && !isCurrent()) return;
    const local = taggedKind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
    const entity = { kind: taggedKind, id: taggedId };
    // Read the address before the optimistic delete clears the viewer's local tag.
    let tagUri = TagNormalizer.toOwnTagUri(
      proof?.tagUrl ?? (await LocalTagCacheService.getViewerTagUri(entity, label, taggerId)),
      taggerId,
    );
    if (proof && !tagUri) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag undo address does not belong to the owner', {
        service: ErrorService.Pubchi,
        operation: 'revertTagSuggestion',
      });
    }
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
        const latest = await LocalTagCacheService.findViewerMutation(entity, label, taggerId);
        // Checked after both reads: a replacement session must not send this DELETE.
        if (isCurrent && !isCurrent()) {
          await this.undo(local, 'delete', { ...write, tagUri });
          return;
        }
        // A re-add of this same file that landed while Nexus was asked has its PUT queued ahead of this request,
        // so a DELETE sent after it would remove the tag the viewer just put back. Any other newer write, a re-add
        // into another app folder or the undo of a failed re-add, still needs this file gone.
        const readdedSameFile =
          latest !== undefined && latest.id !== write.mutationId && latest.relationship && latest.uri === tagUri;
        if (tagUri && readdedSameFile) return;
      }
      // Nexus reporting no tag, like an already absent homeserver record, agrees with the optimistic deletion.
      if (tagUri) {
        if (!canWrite(tagUri)) {
          throw Err.auth(AuthErrorCode.FORBIDDEN, 'The session cannot write the app folder of this tag', {
            service: ErrorService.Local,
            operation: 'commitDelete',
            context: { taggedKind, taggedId, taggerId },
          });
        }
        const resolvedUri = tagUri;
        const fence = HomeserverService.createWriteFence({ guardFirstPass: true });
        const completed = await this.enqueueWrite(resolvedUri, async () => {
          fence.assertCurrent();
          if (isCurrent && !isCurrent()) return false;
          if (!proof) {
            await this.writeFixedTag(HttpMethod.DELETE, resolvedUri);
            return true;
          }
          return retryHomeserverWriteAfterReread(fence, async () => {
            if (isCurrent && !isCurrent()) return false;
            const raw = await HomeserverService.requestRawText(resolvedUri);
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
            if ((await sha256Hex(canonicalJson(remote))) !== proof.expectedHash) {
              throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag changed since this suggestion was applied', {
                service: ErrorService.Pubchi,
                operation: 'revertTagSuggestion',
              });
            }
            await HomeserverService.request({ method: HttpMethod.DELETE, url: resolvedUri, fence });
            return true;
          });
        }).catch((error: unknown) => {
          if (!(error instanceof AppError && error.code === ClientErrorCode.NOT_FOUND)) throw error;
          return true;
        });
        if (!completed) {
          await this.undo(local, 'delete', { ...write, tagUri });
          return;
        }
      }
    } catch (error) {
      // The restored tag keeps the address that failed, so the next attempt needs no Nexus round trip.
      await this.undo(local, 'delete', { ...write, tagUri });
      throw error;
    }
    await LocalTagCacheService.completeMutation(entity, { mutationId: write.mutationId, isCurrent });
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
