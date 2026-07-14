import type { PubkyAppFeedReach } from 'pubky-app-specs';
import validationLimits from 'pubky-app-specs/validationLimits.json';
import {
  isFeedDeleteParams,
  type TFeedPersistCreateParams,
  type TFeedPersistDeleteParams,
  type TFeedPersistParams,
} from '@/application/feed/feed.types';
import { isProfileTagReachSupported } from '@/config/feed';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { reachToString } from '@/models/feed/feed.helpers';
import { normalizeTagList } from './feed.utils';

const MIN_TAGS = 1;
const MAX_TAGS = validationLimits.feedTagsMaxCount;

export class FeedValidators {
  private constructor() {}

  /** Validates that a feed has a supported reach and valid independent tag scopes. */
  static validateTagScope(
    tags: string[] | undefined | null,
    domainTags: string[] | undefined | null,
    reach: PubkyAppFeedReach,
  ): void {
    const normalizedTags = normalizeTagList(tags);
    const normalizedDomainTags = normalizeTagList(domainTags);

    if (normalizedTags.length < MIN_TAGS && normalizedDomainTags.length < MIN_TAGS) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'At least one tag is required', {
        service: ErrorService.PubkyAppSpecs,
        operation: 'validateTagScope',
        context: { tags, domainTags },
      });
    }

    this.validateTagListLimit(normalizedTags, 'post tags');
    this.validateTagListLimit(normalizedDomainTags, 'profile tags');

    if (normalizedDomainTags.length > 0 && !isProfileTagReachSupported(reachToString(reach))) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Profile tags are not supported for this feed reach', {
        service: ErrorService.PubkyAppSpecs,
        operation: 'validateTagScope',
        context: { reach: reachToString(reach), domainTags },
      });
    }
  }

  private static validateTagListLimit(tags: string[], fieldName: string): void {
    if (tags.length > MAX_TAGS) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, `Maximum ${MAX_TAGS} tags allowed`, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'validateTagScope',
        context: { tags, fieldName },
      });
    }
  }

  /**
   * Validates that params are valid for DELETE action.
   * Throws an error if validation fails.
   *
   * @param params - Parameters to validate
   * @throws Error if params are invalid for DELETE action
   */
  static validateDeleteParams(params: TFeedPersistParams): asserts params is TFeedPersistDeleteParams {
    if (!isFeedDeleteParams(params)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid params for DELETE action', {
        service: ErrorService.PubkyAppSpecs,
        operation: 'validateDeleteParams',
        context: { params },
      });
    }
  }

  /**
   * Validates that params are valid for PUT action.
   * Throws an error if validation fails.
   *
   * @param params - Parameters to validate
   * @throws Error if params are invalid for PUT action
   */
  static validatePutParams(params: TFeedPersistParams): asserts params is TFeedPersistCreateParams {
    if (isFeedDeleteParams(params)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid params for PUT action', {
        service: ErrorService.PubkyAppSpecs,
        operation: 'validatePutParams',
        context: { params },
      });
    }
  }
}
