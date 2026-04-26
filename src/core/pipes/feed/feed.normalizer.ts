import { FeedResult } from 'pubky-app-specs';
import * as Core from '@/core';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export type TFeedNormalizerInput = {
  params: Core.TFeedCreateParams;
  userId: Core.Pubky;
};

export class FeedNormalizer {
  private constructor() {}

  static to({ params, userId }: TFeedNormalizerInput): FeedResult {
    try {
      // Normalize tags to ensure consistent format: lowercase, trim whitespace, remove duplicates and empty strings
      const normalizedTags = [...new Set(params.tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0))];

      const content = params.content !== null ? Core.postKindToString(params.content) : null;

      const builder = Core.PubkySpecsSingleton.get(userId);

      return builder.createFeed(
        normalizedTags,
        Core.reachToString(params.reach),
        Core.layoutToString(params.layout),
        Core.sortToString(params.sort),
        content,
        params.name.trim(),
      );
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createFeed',
        context: { params, userId },
      });
    }
  }
}
