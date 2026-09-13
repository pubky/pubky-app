import { TagApplication } from '@/application/tag/tag';
import type { TTagEventParams } from '@/controllers/tag/tag.types';
import { captureViewerSession } from '@/controllers/tag/tag-cache.utils';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import type { TViewerTagMutationsParams } from '@/services/local/tag/tag.types';

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
    const { tagUrl, label, taggerId, taggedId, taggedKind } = TagNormalizer.from(params);

    await TagApplication.commitDelete({
      taggedId,
      label,
      taggedKind,
      taggerId,
      tagUrl,
      isCurrent: captureViewerSession(),
    });
  }
}
