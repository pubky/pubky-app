import { TagResult, postUriBuilder, userUriBuilder } from 'pubky-app-specs';
import * as Core from '@/core';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export class TagNormalizer {
  private constructor() {}

  static from({ taggedKind, taggedId, label, taggerId }: Core.TTagEventParams): Core.TTagFromResponse {
    try {
      let uri: string;
      if (taggedKind === Core.TagKind.POST) {
        const { pubky, id: postId } = Core.parseCompositeId(taggedId);
        uri = postUriBuilder(pubky, postId);
      } else {
        uri = userUriBuilder(taggedId);
      }
      const { tag, meta } = Core.TagNormalizer.to(uri, label.trim(), taggerId);

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

  static to(uri: string, label: string, pubky: Core.Pubky): TagResult {
    try {
      const builder = Core.PubkySpecsSingleton.get(pubky);
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
