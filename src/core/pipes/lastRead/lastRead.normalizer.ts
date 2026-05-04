import { LastReadResult } from 'pubky-app-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
export class LastReadNormalizer {
  private constructor() {}

  static to(pubky: Pubky): LastReadResult {
    try {
      const builder = PubkySpecsSingleton.get(pubky);
      return builder.createLastRead();
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createLastRead',
        context: { pubky },
      });
    }
  }
}
