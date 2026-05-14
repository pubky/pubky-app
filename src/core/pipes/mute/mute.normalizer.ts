import { MuteResult } from 'pubky-app-specs';
import type { TMuteParams } from '@/controllers/mute/mute.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';

export class MuteNormalizer {
  private constructor() {}

  static to({ muter, mutee }: TMuteParams): MuteResult {
    try {
      const builder = PubkySpecsSingleton.get(muter);
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
