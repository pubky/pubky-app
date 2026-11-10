import { TagApplication } from '@/application/tag/tag';
import type {
  TDeleteResourceTagParams,
  TFetchResourceTagsParams,
  TResourceTagEventParams,
  TTagEventParams,
} from '@/controllers/tag/tag.types';
import { captureSessionWriteAccess, captureViewerSession } from '@/controllers/tag/tag-cache.utils';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import type { TViewerTagMutationsParams } from '@/services/local/tag/tag.types';
import type { NexusTag } from '@/services/nexus/nexus.types';

export class TagController {
  private constructor() {}

  static getViewerMutations(params: TViewerTagMutationsParams) {
    return TagApplication.getViewerMutations(params);
  }

  /**
   * Create a tag
   * @param params - Parameters object
   * @param params.targetId - ID of the post or user to tag
   * @param params.label - Tag label
   * @param params.taggerId - ID of the user adding the tag
   */
  static async commitCreate(params: TTagEventParams) {
    const tag = TagNormalizer.from(params);

    await TagApplication.commitCreate({ tagList: [tag], isCurrent: captureViewerSession() });
  }

  /**
   * Delete a tag
   * @param params - Parameters object
   * @param params.targetId - ID of the post or user
   * @param params.label - Tag label to remove
   * @param params.taggerId - ID of the user removing the tag
   */
  static async commitDelete(params: TTagEventParams) {
    // Only the label validation is used: the application resolves which tag file to delete.
    const { label, taggerId, taggedId, taggedKind } = TagNormalizer.from(params);

    await TagApplication.commitDelete({
      taggedId,
      label,
      taggedKind,
      taggerId,
      isCurrent: captureViewerSession(),
      canWrite: captureSessionWriteAccess(),
    });
  }

  /**
   * The tags on an external resource (a web link), as Nexus reports them. Network only.
   *
   * @param params.uri - The link exactly as written
   * @param params.viewerId - The viewer, so their own tags are marked; null when signed out
   * @param params.fresh - Ask Nexus again even when a fresh answer is cached (after a tag write)
   * @returns The link's tags, `[]` when nobody tagged it
   */
  static fetchResourceTags({
    uri,
    viewerId,
    fresh,
    spellings,
    spellingsByUri,
  }: TFetchResourceTagsParams & { fresh?: boolean }) {
    return TagApplication.fetchResourceTags({ uri, viewerId, spellings, spellingsByUri, ...(fresh ? { fresh } : {}) });
  }

  /** Whether a tag write of the viewer's on the link (or its spellings) is still missing from Nexus' answers. */
  static hasUnconfirmedResourceTags({ uri, viewerId, spellings }: TFetchResourceTagsParams) {
    return TagApplication.hasUnconfirmedResourceTags({ uri, viewerId, spellings });
  }

  /**
   * Follows the tags on an external resource as other readers of the same link see them: `listener`
   * gets the shared answer each time it changes (another card's read or tag write). Network state
   * only, nothing is fetched.
   *
   * @returns The unsubscribe
   */
  static subscribeResourceTags(
    { uri, viewerId, spellings }: TFetchResourceTagsParams,
    listener: (tags: NexusTag[]) => void,
  ) {
    return TagApplication.subscribeResourceTags({ uri, viewerId, spellings }, listener);
  }

  /**
   * The tags on an external resource another reader of the link already brought in; nothing is
   * fetched. `undefined` when the link was not read for this viewer.
   */
  static getCachedResourceTags({ uri, viewerId }: TFetchResourceTagsParams) {
    return TagApplication.getCachedResourceTags({ uri, viewerId });
  }

  /**
   * Tag an external resource: a social v1 Tag whose `uri` is the link itself.
   *
   * @returns The label as stored (trimmed, ASCII-lowercased) and the tag file written
   */
  static async commitCreateResource({
    taggerId,
    uri,
    label,
  }: TResourceTagEventParams): Promise<{ label: string; tagUri: string }> {
    const { object, url, body } = TagNormalizer.to(uri, label, taggerId);

    await TagApplication.commitCreateResource(
      { tagUrl: url, tagBody: body, isCurrent: captureViewerSession() },
      { uri, label: object.label, viewerId: taggerId },
    );
    return { label: object.label, tagUri: url };
  }

  /**
   * Remove the viewer's tag from an external resource. The file is the one Nexus reports
   * (`tag_uri`, which may live in another app's folder) when it is the viewer's own; otherwise the
   * tag this app writes, whose id hashes the link and the label, so building it again names it.
   * When Nexus reports another file than the one this app writes for the link as written, both go:
   * one person may hold a file per spelling Nexus folds into one resource, and Nexus names one.
   * With `spellings` (the link's other spellings, shown as one), the tag goes on every spelling the
   * viewer's tag is on by the answers read, each with its own file; on `uri` when none says so.
   */
  static async commitDeleteResource({ spellings = [], ...params }: TDeleteResourceTagParams) {
    if (spellings.length === 0) return this.deleteResourceTag(params);
    const { taggerId, uri, label } = params;
    const links = TagApplication.getViewerResourceTagLinks({ uris: [uri, ...spellings], viewerId: taggerId, label });
    if (links.length === 0) return this.deleteResourceTag(params);
    for (const link of links) await this.deleteResourceTag({ taggerId, label, uri: link.uri, tagUri: link.tagUri });
  }

  /** Removes the viewer's tag from one spelling of an external resource (`commitDeleteResource`). */
  private static async deleteResourceTag({ taggerId, uri, label, tagUri }: TDeleteResourceTagParams) {
    const built = TagNormalizer.to(uri, label, taggerId);
    const reported = TagNormalizer.toOwnTagUri(tagUri, taggerId);

    await TagApplication.commitDeleteResource(
      {
        tagUri: reported ?? built.url,
        ...(reported && reported !== built.url ? { alsoTagUri: built.url } : {}),
        isCurrent: captureViewerSession(),
        canWrite: captureSessionWriteAccess(),
      },
      { uri, label: built.object.label, viewerId: taggerId },
    );
  }
}
