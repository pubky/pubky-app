import { buildTag, buildUri, type Built, type Tag } from 'pubky-social-specs';
import { TagKind } from '@/application/tag/tag.types';
import type { TTagEventParams, TTagFromResponse } from '@/controllers/tag/tag.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';

export class TagNormalizer {
  private constructor() {}

  static from({ taggedKind, taggedId, label, taggerId }: TTagEventParams): TTagFromResponse {
    let uri: string;
    try {
      if (taggedKind === TagKind.POST) {
        const { pubky, id: postId } = parseCompositeId(taggedId);
        uri = buildUri(pubky, 'post', postId);
      } else {
        // The profile URL, as the migration respells a 0.x user tag, so both land on one target.
        uri = buildUri(taggedId, 'user');
      }
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error instanceof Error ? error.message : String(error), {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createTagFromParams',
        context: { taggedKind, taggedId, label, taggerId },
        cause: error,
      });
    }
    const { object, url, body } = TagNormalizer.to(uri, label, taggerId);

    return {
      taggerId,
      taggedId,
      label: object.label,
      taggedKind,
      tagUrl: url,
      tagBody: body,
    };
  }

  static to(uri: string, label: string, pubky: Pubky): Built<Tag> {
    try {
      return buildTag(pubky, uri, label);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error instanceof Error ? error.message : String(error), {
        service: ErrorService.PubkyAppSpecs,
        operation: 'buildTag',
        context: { uri, label, pubky },
        cause: error,
      });
    }
  }
}
