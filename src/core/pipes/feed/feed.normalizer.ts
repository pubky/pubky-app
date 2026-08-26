import { FeedResult } from 'pubky-app-specs';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { layoutToString, postKindToString, reachToString, sortToString } from '@/models/feed/feed.helpers';
import type { Pubky } from '@/models/models.types';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import { normalizeTagList } from './feed.utils';
import { FeedValidators } from './feed.validators';

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

      return builder.createFeed({
        tags: normalizedTags,
        reach: reachToString(params.reach),
        layout: layoutToString(params.layout),
        sort: sortToString(params.sort),
        content: content ?? undefined,
        name: params.name.trim(),
        domainTags: normalizedDomainTags.length > 0 ? normalizedDomainTags : undefined,
        // Single chokepoint for create + update: coerce the icon into a value
        // specs accepts, so a bad icon degrades to the default instead of
        // failing the whole feed write.
        icon: FeedValidators.sanitizeIcon(params.icon),
      });
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createFeed',
        context: { params, userId },
      });
    }
  }
}
