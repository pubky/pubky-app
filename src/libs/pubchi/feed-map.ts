import { feedReaches, feedSorts, isOneOf } from 'pubky-social-specs';
import { DEFAULT_CUSTOM_FEED_ICON } from '@/config/feed';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { FeedMappingV2, FeedProposalV1, FeedProposalV2 } from '@/libs/pubchi/schemas/feed';
import { toStoredPostKind } from '@/pipes/post/post.kind';

export type FeedProposalV2ApplyReason = 'followers_not_authorable' | 'unmapped' | 'unsupported_mapping';

export type FeedProposalV2MapResult = {
  params: TFeedCreateParams;
  mapping: FeedMappingV2;
  warnings: string[];
  canApply: boolean;
  reasons: FeedProposalV2ApplyReason[];
};

export function feedProposalToCreateParams(proposal: FeedProposalV1): TFeedCreateParams {
  const config = proposal.feed.feed;
  const { reach, sort, layout } = config;
  const content = config.content ? toStoredPostKind(config.content) : null;
  if (!isOneOf(feedReaches, reach) || !isOneOf(feedSorts, sort) || (config.content && content === null)) {
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'FEED_SPECS_INVALID', {
      service: ErrorService.Pubchi,
      operation: 'feedProposalToCreateParams',
    });
  }
  return {
    name: proposal.feed.name,
    icon: proposal.feed.icon ?? DEFAULT_CUSTOM_FEED_ICON,
    tags: config.tags ?? [],
    domain_tags: config.domain_tags ?? [],
    reach,
    sort,
    content,
    layout,
  };
}

export function feedProposalV2ToCreateParams(proposal: FeedProposalV2): FeedProposalV2MapResult {
  const config = proposal.feed.feed;
  const params: TFeedCreateParams = {
    name: proposal.feed.name,
    icon: proposal.feed.icon,
    tags: config.tags ?? [],
    domain_tags: config.domain_tags ?? [],
    reach: config.reach,
    sort: config.sort,
    content: config.content ? toStoredPostKind(config.content) : null,
    layout: config.layout,
  };
  const reasons: FeedProposalV2ApplyReason[] = [];
  if (config.reach === 'followers') reasons.push('followers_not_authorable');
  if (proposal.mapping.unmapped.length > 0) reasons.push('unmapped');
  if (proposal.mapping.status === 'unsupported') reasons.push('unsupported_mapping');
  return {
    params,
    mapping: proposal.mapping,
    warnings: proposal.warnings,
    canApply: reasons.length === 0,
    reasons,
  };
}
