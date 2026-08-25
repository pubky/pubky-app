import type { PubkyAppFeedReach } from 'pubky-app-specs';
import validationLimits from 'pubky-app-specs/validationLimits.json';
import {
  isFeedDeleteParams,
  type TFeedPersistCreateParams,
  type TFeedPersistDeleteParams,
  type TFeedPersistParams,
} from '@/application/feed/feed.types';
import { DEFAULT_CUSTOM_FEED_ICON, isProfileTagReachSupported, LUCIDE_ICON_NAME_PATTERN } from '@/config/feed';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { reachToString } from '@/models/feed/feed.helpers';
import { normalizeTagList } from './feed.utils';

const MIN_TAGS = 1;
const MAX_TAGS = validationLimits.feedTagsMaxCount;
const MAX_ICON_LENGTH = validationLimits.feedIconMaxLength;
// The stored icon must satisfy BOTH specs' charset and the UI resolver, so we
// validate against the shared name pattern rather than specs' looser charset:
// `-house` or `a--b` would pass specs and then render as the fallback forever.
// Case and whitespace are normalized (specs lowercases too) so a name another
// client wrote as `Activity` still resolves.

export class FeedValidators {
  private constructor() {}

  /**
   * Coerces an icon coming from storage or a remote payload into a value
   * `PubkySpecsBuilder.createFeed` will accept.
   *
   * Specs rejects an empty icon, one longer than `feedIconMaxLength`, and one
   * with characters outside `[a-z0-9-]`, and `createFeed` throws on rejection
   * — during bootstrap that throw is caught per-feed, so an unusable icon
   * would silently drop the whole feed from the user's list. Falling back to
   * the default keeps the feed.
   *
   * Names that are merely unknown to us (another client's icon set) pass
   * through — as long as they fit specs' constraints — so a round-trip through
   * this app does not overwrite them; the UI already renders a fallback for
   * names it cannot resolve. Only case and surrounding whitespace are
   * normalized, matching both specs and the UI's `toLucideIconName`.
   */
  static sanitizeIcon(icon: string | undefined | null): string {
    const normalized = icon?.trim().toLowerCase();

    if (!normalized || normalized.length > MAX_ICON_LENGTH || !LUCIDE_ICON_NAME_PATTERN.test(normalized)) {
      return DEFAULT_CUSTOM_FEED_ICON;
    }

    return normalized;
  }

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
