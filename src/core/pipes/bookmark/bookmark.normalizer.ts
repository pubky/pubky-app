import { type Bookmark, buildBookmark, type Built, type PostRef } from 'pubky-social-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';

export class BookmarkNormalizer {
  private constructor() {}

  static to(postRef: PostRef, userId: Pubky): Built<Bookmark> {
    try {
      return buildBookmark(userId, postRef);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error instanceof Error ? error.message : String(error), {
        service: ErrorService.PubkyAppSpecs,
        operation: 'buildBookmark',
        context: { postRef, userId },
        cause: error,
      });
    }
  }
}
