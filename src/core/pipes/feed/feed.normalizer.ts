import { buildFeed, type Built, type Feed } from 'pubky-social-specs';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { normalizeTagList } from './feed.utils';
import { FeedValidators } from './feed.validators';

export type TFeedNormalizerInput = {
  params: TFeedCreateParams;
  userId: Pubky;
};

export class FeedNormalizer {
  private constructor() {}

  static to({ params, userId }: TFeedNormalizerInput): Built<Feed> {
    const tags = normalizeTagList(params.tags);
    const domainTags = normalizeTagList(params.domain_tags);
    try {
      return buildFeed(userId, {
        name: params.name,
        // Single chokepoint for create + update: a bad icon degrades to the default instead of
        // failing the whole feed write.
        icon: FeedValidators.sanitizeIcon(params.icon),
        reach: params.reach,
        layout: params.layout,
        sort: params.sort,
        content: params.content,
        tags: tags.length > 0 ? tags : null,
        domain_tags: domainTags.length > 0 ? domainTags : null,
      });
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error instanceof Error ? error.message : String(error), {
        service: ErrorService.PubkyAppSpecs,
        operation: 'buildFeed',
        context: { params, userId },
        cause: error,
      });
    }
  }
}
