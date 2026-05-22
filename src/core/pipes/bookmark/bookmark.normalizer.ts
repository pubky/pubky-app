import { BookmarkResult } from 'pubky-app-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';

export class BookmarkNormalizer {
  private constructor() {}

  static to(postUri: string, userId: Pubky): BookmarkResult {
    try {
      const builder = PubkySpecsSingleton.get(userId);
      const result = builder.createBookmark(postUri);
      Logger.debug('Bookmark validated', { result });
      return result;
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createBookmark',
        context: { postUri, userId },
      });
    }
  }
}
