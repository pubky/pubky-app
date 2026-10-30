import { LastReadResult } from 'pubky-app-specs';
import { APP_LAST_READ_FILE, APP_PRIVATE_PATH } from '@/config/app-files';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';

export class LastReadNormalizer {
  private constructor() {}

  /** The app-owned notification read cursor, in the app's private namespace. */
  static buildUrl(pubky: Pubky): string {
    return `pubky://${pubky}${APP_PRIVATE_PATH}${APP_LAST_READ_FILE}`;
  }

  /** Where a 0.x client kept the cursor; read while the v1 file is absent. */
  static buildLegacyUrl(pubky: Pubky): string {
    return `pubky://${pubky}/pub/pubky.app/last_read`;
  }

  static to(pubky: Pubky): LastReadResult {
    try {
      const builder = PubkySpecsSingleton.get(pubky);
      return builder.createLastRead();
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.SocialSpecs,
        operation: 'createLastRead',
        context: { pubky },
      });
    }
  }
}
