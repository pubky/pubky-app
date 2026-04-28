import { FollowResult } from 'pubky-app-specs';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { TFollowParams } from '@/controllers/user/user.type';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
export class FollowNormalizer {
  private constructor() {}

  static to({ follower, followee }: TFollowParams): FollowResult {
    try {
      const builder = PubkySpecsSingleton.get(follower);
      // Strip any prefix (pubky or pk:) from the followee ID before passing to createFollow
      // pubky-app-specs expects a raw 52-character z-base-32 encoded public key
      const normalizedFollowee = stripPubkyPrefix(followee);
      const result = builder.createFollow(normalizedFollowee);
      return result;
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createFollow',
        context: { follower, followee },
      });
    }
  }
}
