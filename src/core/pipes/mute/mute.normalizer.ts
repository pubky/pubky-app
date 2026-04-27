import { MuteResult } from 'pubky-app-specs';
import * as Core from '@/core';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export class MuteNormalizer {
  private constructor() {}

  static to({ muter, mutee }: Core.TMuteParams): MuteResult {
    try {
      const builder = Core.PubkySpecsSingleton.get(muter);
      // Strip any prefix (pubky or pk:) from the mutee ID before passing to createMute
      // pubky-app-specs expects a raw 52-character z-base-32 encoded public key
      const normalizedMutee = stripPubkyPrefix(mutee);
      return builder.createMute(normalizedMutee);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createMute',
        context: { muter, mutee },
      });
    }
  }
}
