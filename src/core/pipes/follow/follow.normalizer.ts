import { FollowResult } from 'pubky-app-specs';
import * as Core from '@/core';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export class FollowNormalizer {
  private constructor() {}

  static to({ follower, followee }: Core.TFollowParams): FollowResult {
    try {
      const builder = Core.PubkySpecsSingleton.get(follower);
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
