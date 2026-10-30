import { buildFeed, type Built, type Feed } from 'pubky-social-specs';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { toStoredPostKind } from '@/pipes/post/post.kind';
import { toSpecsValidationError } from '@/pipes/specs.errors';
import { normalizeTagList } from './feed.utils';
import { FeedValidators } from './feed.validators';

export type TFeedNormalizerInput = {
  params: TFeedCreateParams;
  userId: Pubky;
};

export class FeedNormalizer {
  private constructor() {}

  /**
   * The private feed object for `params`: `buildFeed` derives the id from the filter alone
   * (reach, layout, sort, content, tags, domain tags), so a rename or a new icon keeps the id and
   * an edited filter moves the feed. Tag lists are folded here and by the package; an empty list
   * is left out, which the package requires. The content kind crosses the local vocabulary once
   * (`short` → `note`, `long` → `article`) so a caller holding a stream kind cannot store a 0.x name.
   */
  static to({ params, userId }: TFeedNormalizerInput): Built<Feed> {
    const tags = normalizeTagList(params.tags);
    const domainTags = normalizeTagList(params.domain_tags);
    const content = params.content === null ? null : toStoredPostKind(params.content);
    if (params.content !== null && content === null) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, `Unsupported feed content kind: ${params.content}`, {
        service: ErrorService.SocialSpecs,
        operation: 'buildFeed',
        context: { params, userId },
      });
    }

    try {
      return buildFeed(userId, {
        name: params.name.trim(),
        // Single chokepoint for create + update: a bad icon degrades to the default instead of
        // failing the whole feed write.
        icon: FeedValidators.sanitizeIcon(params.icon),
        reach: params.reach,
        layout: params.layout,
        sort: params.sort,
        content,
        tags: tags.length > 0 ? tags : null,
        domain_tags: domainTags.length > 0 ? domainTags : null,
      });
    } catch (error) {
      throw toSpecsValidationError(error, 'buildFeed', { params, userId });
    }
  }
}
