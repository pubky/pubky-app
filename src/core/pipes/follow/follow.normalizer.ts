import { buildFollow, type Built, deletionPaths, type Follow, type Owner, toUrl } from 'pubky-social-specs';
import type { TFollowParams } from '@/controllers/user/user.type';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { stripPubkyPrefix } from '@/libs/utils/utils';

export class FollowNormalizer {
  private constructor() {}

  static to({ follower, followee }: TFollowParams): Built<Follow, Owner, 'follow'> {
    try {
      // The builder takes a bare 52-character z-base-32 key
      return buildFollow(follower, stripPubkyPrefix(followee));
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error instanceof Error ? error.message : String(error), {
        service: ErrorService.PubkyAppSpecs,
        operation: 'buildFollow',
        context: { follower, followee },
        cause: error,
      });
    }
  }

  /** Every copy an unfollow deletes: the 0.x follow first, then the v1 one. */
  static toDeleteUrls({ follower, followee }: TFollowParams): string[] {
    return deletionPaths({ kind: 'follow', id: stripPubkyPrefix(followee) }).map((path) => toUrl(follower, path));
  }
}
