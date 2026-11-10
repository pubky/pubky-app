import {
  TagKind,
  type TCreateResourceTagInput,
  type TCreateTagListInput,
  type TDeleteResourceTagInput,
  type TDeleteTagInput,
} from '@/application/tag/tag.types';
import { createTagMutationId } from '@/application/tag/tag.utils';
import type { TTagEventParams } from '@/controllers/tag/tag.types';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { canonicalizeTagLabel } from '@/libs/utils/utils';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import { mergeResourceTags, type TResourceViewerTag } from '@/pipes/tag/tag.resource';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import type { TLocalTagParams, TViewerTagMutationsParams } from '@/services/local/tag/tag.types';
import { LocalTagCacheService } from '@/services/local/tag/tag-cache';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { NexusPostService } from '@/services/nexus/post/post';
import { NexusResourceService } from '@/services/nexus/resource/resource';
import { NexusUserService } from '@/services/nexus/user/user';

type TLocalTagService = typeof LocalPostTagService | typeof LocalUserTagService;
/** An external resource's tags for the viewer, with the other spellings of its link read along. */
type TResourceTagsRead = { uri: string; viewerId?: string | null; spellings?: readonly string[] };
type TTagWrite = Pick<TLocalTagParams, 'taggerId' | 'taggedId' | 'label' | 'mutationId' | 'tagUri'>;

/** Optimistic writes and conditional compensation share their operation ID in IndexedDB. */
export class TagApplication {
  static getViewerMutations({ taggedKind, taggedId, taggerId }: TViewerTagMutationsParams) {
    return LocalTagCacheService.getViewerMutations({ kind: taggedKind, id: taggedId }, taggerId);
  }

  static async commitCreate({ tagList, isCurrent }: TCreateTagListInput) {
    // Sequential: a failed entry leaves no hidden in-flight writes for later tags.
    for (const { taggerId, taggedId, label, tagUrl, tagBody, taggedKind } of tagList) {
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
        await HomeserverService.putBlob({ url: tagUrl, blob: tagBody });
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
   * The tags on an external resource (a web link), `[]` when nobody tagged it. Network only. With
   * `spellings`, the link's other spellings are read in the same `by_ids` batch and their tags
   * merged into its own (`mergeResourceTags`). On a Nexus without `by_ids` they are read (one
   * `by-uri` each) only with `spellingsByUri`, else the link is read alone. A spelling whose read
   * failed (the service reported it) counts with its last answer, or is left out without one, and
   * the read fails only when every read did.
   */
  static async fetchResourceTags({
    uri,
    viewerId,
    fresh,
    spellings = [],
    spellingsByUri = false,
  }: TResourceTagsRead & { fresh?: boolean; spellingsByUri?: boolean }): Promise<NexusTag[]> {
    const read = (link: string) =>
      NexusResourceService.fetchTagsByUri({ uri: link, viewerId, ...(fresh ? { fresh } : {}) });
    const own = read(uri);
    if (spellings.length === 0) return own;
    if (!spellingsByUri) {
      // The link's own read finds out whether Nexus serves `by_ids`.
      if (!NexusResourceService.isByIdsServed()) await own.catch(() => {});
      if (!NexusResourceService.isByIdsServed()) return own;
    }
    const links = [uri, ...spellings];
    const reads = await Promise.allSettled([own, ...spellings.map(read)]);
    const answers = reads.flatMap((result, index) => {
      if (result.status === 'fulfilled') return [result.value];
      const last = NexusResourceService.getCachedTags({ uri: links[index], viewerId });
      return last ? [last] : [];
    });
    if (answers.length === 0) throw (reads[0] as PromiseRejectedResult).reason;
    return mergeResourceTags(answers);
  }

  /** Whether a tag write of the viewer's on the link or a spelling is still missing from Nexus' answers. */
  static hasUnconfirmedResourceTags({ uri, viewerId, spellings = [] }: TResourceTagsRead): boolean {
    return [uri, ...spellings].some((link) => NexusResourceService.hasUnconfirmedTags({ uri: link, viewerId }));
  }

  /**
   * Every later change of the shared answer `fetchResourceTags` reads; returns the unsubscribe. With
   * `spellings`, a change of any spelling's answer, merged with the other answers read (a spelling
   * whose read failed has none and is left out).
   */
  static subscribeResourceTags(
    { uri, viewerId, spellings = [] }: TResourceTagsRead,
    listener: (tags: NexusTag[]) => void,
  ): () => void {
    if (spellings.length === 0) return NexusResourceService.subscribeTags({ uri, viewerId }, listener);
    const links = [uri, ...spellings];
    const onChange = () => {
      const answers = links
        .map((link) => NexusResourceService.getCachedTags({ uri: link, viewerId }))
        .filter((tags): tags is NexusTag[] => tags !== undefined);
      listener(mergeResourceTags(answers));
    };
    const unsubscribes = links.map((link) => NexusResourceService.subscribeTags({ uri: link, viewerId }, onChange));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  /**
   * The links among `uris` the viewer's tag `label` is on, by the answers already read, each with the
   * tag file Nexus reports there: removing the tag deletes it on each spelling it was written to.
   */
  static getViewerResourceTagLinks({
    uris,
    viewerId,
    label,
  }: {
    uris: readonly string[];
    viewerId: string;
    label: string;
  }): { uri: string; tagUri: string | null }[] {
    const key = canonicalizeTagLabel(label);
    return uris.flatMap((uri) => {
      const tag = NexusResourceService.getCachedTags({ uri, viewerId })?.find(
        (entry) => entry.relationship && canonicalizeTagLabel(entry.label) === key,
      );
      return tag ? [{ uri, tagUri: tag.tag_uri ?? null }] : [];
    });
  }

  /** The shared answer `fetchResourceTags` read, without asking Nexus; `undefined` when none was read. */
  static getCachedResourceTags({ uri, viewerId }: { uri: string; viewerId?: string | null }): NexusTag[] | undefined {
    return NexusResourceService.getCachedTags({ uri, viewerId });
  }

  /**
   * Tag an external resource. There is no local tag table for web links, so the write goes
   * straight to the homeserver; once it is accepted the shared Nexus answer for the link takes the
   * tag, since Nexus indexes it with a delay. A failed write changes nothing.
   */
  static async commitCreateResource(
    { tagUrl, tagBody, isCurrent }: TCreateResourceTagInput,
    viewerTag: TResourceViewerTag & { uri: string },
  ) {
    if (isCurrent && !isCurrent()) return;
    await HomeserverService.putBlob({ url: tagUrl, blob: tagBody });
    NexusResourceService.applyViewerTag({ ...viewerTag, tagUri: tagUrl }, true);
  }

  /**
   * Remove the viewer's tag from an external resource: one DELETE of the resolved tag file (an
   * already absent file is the state a delete wants), then the shared Nexus answer drops it.
   */
  static async commitDeleteResource(
    { tagUri, alsoTagUri, isCurrent, canWrite }: TDeleteResourceTagInput,
    viewerTag: TResourceViewerTag & { uri: string },
  ) {
    if (isCurrent && !isCurrent()) return;
    // The second file first (usually already absent): a failure on the file Nexus reports then leaves
    // the tag as it was, which the caller's rollback shows.
    const files = alsoTagUri && alsoTagUri !== tagUri ? [alsoTagUri, tagUri] : [tagUri];
    if (!files.every((file) => canWrite(file))) {
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'The session cannot write the app folder of this tag', {
        service: ErrorService.Local,
        operation: 'commitDeleteResource',
        context: { taggerId: viewerTag.viewerId },
      });
    }
    for (const file of files) {
      // An absent file is already deleted (the second one usually is).
      await HomeserverService.request({ method: HttpMethod.DELETE, url: file }).catch((error: unknown) => {
        if (!(error instanceof AppError && error.code === ClientErrorCode.NOT_FOUND)) throw error;
      });
    }
    NexusResourceService.applyViewerTag(viewerTag, false);
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
