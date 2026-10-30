import { postUriBuilder, TagResult, userUriBuilder } from 'pubky-app-specs';
import { TagKind } from '@/application/tag/tag.types';
import type { TTagEventParams, TTagFromResponse } from '@/controllers/tag/tag.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
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
        service: ErrorService.SocialSpecs,
        operation: 'createTagFromParams',
        context: { taggedKind, taggedId, label, taggerId },
      });
    }
  }

  /**
   * A viewer may delete only a tag file under their own `/pub/`: an app folder of one or two segments
   * (`pubky.app`, `mapky`, `social/v1`, ...) followed by `tags/<id>`. Anything else is treated as a missing address.
   */
  static toOwnTagUri(tagUri: string | null | undefined, taggerId: Pubky): string | undefined {
    const prefix = `pubky://${taggerId}/pub/`;
    if (!tagUri?.startsWith(prefix)) return undefined;
    const segments = tagUri.slice(prefix.length).split('/');
    const isTagFile =
      // pubky.app keeps its tags directly in `pubky.app/tags/`, so only other apps may use a two-segment folder.
      (segments.length === 3 || (segments.length === 4 && segments[0] !== 'pubky.app')) &&
      segments.at(-2) === 'tags' &&
      segments.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment) && segment !== '.' && segment !== '..');
    return isTagFile ? tagUri : undefined;
  }

  static to(uri: string, label: string, pubky: Pubky): TagResult {
    try {
      const builder = PubkySpecsSingleton.get(pubky);
      return builder.createTag(uri, label);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.SocialSpecs,
        operation: 'createTag',
        context: { uri, label, pubky },
      });
    }
  }
}
