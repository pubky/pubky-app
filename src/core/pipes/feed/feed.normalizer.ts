import { FeedResult } from 'pubky-app-specs';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { layoutToString, postKindToString, reachToString, sortToString } from '@/models/feed/feed.helpers';
import type { Pubky } from '@/models/models.types';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import { normalizeTagList } from './feed.utils';

export type TFeedNormalizerInput = {
  params: TFeedCreateParams;
  userId: Pubky;
};

export class FeedNormalizer {
  private constructor() {}

  static to({ params, userId }: TFeedNormalizerInput): FeedResult {
    try {
      const normalizedTags = normalizeTagList(params.tags);
      const normalizedDomainTags = normalizeTagList(params.domain_tags).sort();

      const content = params.content !== null ? postKindToString(params.content) : null;

      const builder = PubkySpecsSingleton.get(userId);

      return builder.createFeed(
        normalizedTags,
        reachToString(params.reach),
        layoutToString(params.layout),
        sortToString(params.sort),
        content,
        params.name.trim(),
        normalizedDomainTags.length > 0 ? normalizedDomainTags : undefined,
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
