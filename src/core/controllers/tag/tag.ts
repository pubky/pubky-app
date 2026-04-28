import { TagApplication } from '@/application/tag/tag';
import type { TTagEventParams } from '@/controllers/tag/tag.types';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
export class TagController {
  private constructor() {}

  /**
   * Create a tag
   * @param params - Parameters object
   * @param params.targetId - ID of the post or user to tag
   * @param params.label - Tag label
   * @param params.taggerId - ID of the user adding the tag
   */
  static async commitCreate(params: TTagEventParams) {
    const tag = TagNormalizer.from(params);

    await TagApplication.commitCreate({ tagList: [tag] });
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
    });
  }
}
