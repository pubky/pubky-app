import { TagResult, postUriBuilder, userUriBuilder } from 'pubky-app-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { TagKind } from '@/application/tag/tag.types';
import type { TTagEventParams, TTagFromResponse } from '@/controllers/tag/tag.types';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
export class TagNormalizer {
  private constructor() {}

  static from({ taggedKind, taggedId, label, taggerId }: TTagEventParams): TTagFromResponse {
    try {
      let uri: string;
      if (taggedKind === TagKind.POST) {
        const { pubky, id: postId } = parseCompositeId(taggedId);
        uri = postUriBuilder(pubky, postId);
      } else {
        uri = userUriBuilder(taggedId);
      }
      const { tag, meta } = TagNormalizer.to(uri, label.trim(), taggerId);

      return {
        taggerId,
        taggedId,
        label: tag.label.toLowerCase(),
        taggedKind,
        tagUrl: meta.url,
        tagJson: tag.toJson(),
      };
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createTagFromParams',
        context: { taggedKind, taggedId, label, taggerId },
      });
    }
  }

  static to(uri: string, label: string, pubky: Pubky): TagResult {
    try {
      const builder = PubkySpecsSingleton.get(pubky);
      return builder.createTag(uri, label);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createTag',
        context: { uri, label, pubky },
      });
    }
  }
}
