import { buildFollow, type Built, deletionPaths, type Follow, type Owner, toUrl } from 'pubky-social-specs';
import type { TFollowParams } from '@/controllers/user/user.type';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { toSpecsValidationError } from '@/pipes/specs.errors';

export class FollowNormalizer {
  private constructor() {}

  /** The follow as `pubky-social-specs` stores it under the follower's public root. */
  static to({ follower, followee }: TFollowParams): Built<Follow, Owner, 'follow'> {
    try {
      // The builder takes a bare 52-character z-base32 key, so any `pubky` or `pk:` prefix goes first
      return buildFollow(follower, stripPubkyPrefix(followee));
    } catch (error) {
      throw toSpecsValidationError(error, 'buildFollow', { follower, followee });
    }
  }

  /** Every copy an unfollow deletes: the 0.x follow first, then the v1 one. */
  static toDeleteUrls({ follower, followee }: TFollowParams): string[] {
    try {
      return deletionPaths({ kind: 'follow', id: stripPubkyPrefix(followee) }).map((path) => toUrl(follower, path));
    } catch (error) {
      throw toSpecsValidationError(error, 'followDeletionPaths', { follower, followee });
    }
  }
}
