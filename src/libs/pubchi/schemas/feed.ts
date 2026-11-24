/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 * App adaptation for social v1. The deployed service must use the same contract.
 */

import { validateFeed } from 'pubky-social-specs';
import { z } from 'zod';
import { DEFAULT_CUSTOM_FEED_ICON } from '@/config/feed';
import { toStoredPostKind } from '@/pipes/post/post.kind';
import { err, ok, type ParseResult } from './codes';
import { fromZod, zPubky, zUnix, zVersion1 } from './zod';

/** Reach values the App mapper accepts (Followers has no home equivalent). */
export const APP_SUPPORTED_REACH = ['following', 'friends', 'all', 'wot', 'me'] as const;
export const APP_FEED_REACH = ['following', 'followers', 'friends', 'all', 'wot', 'me'] as const;
export const APP_SUPPORTED_SORT = ['recent', 'popularity'] as const;
export const APP_SUPPORTED_LAYOUT = ['columns', 'wide', 'visual', 'list'] as const;
export const APP_FEED_CONTENT = ['short', 'long', 'image', 'video', 'link', 'file', 'collection', 'unknown'] as const;
export const APP_SUPPORTED_CONTENT = ['short', 'long', 'image', 'video', 'link', 'file', 'collection'] as const;

export const pubchiFeedIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const FeedConfigSchema = z
  .object({
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    domain_tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    reach: z.string(),
    layout: z.enum(APP_SUPPORTED_LAYOUT),
    sort: z.string(),
    content: z.string().optional(),
  })
  .strict();

const ProposalFeedSchema = z
  .object({
    feed: FeedConfigSchema,
    name: z.string().min(1).max(100),
    created_at: zUnix,
    icon: z.string().max(300).optional(),
  })
  .strict();

export const FeedProposalV1Schema = z
  .object({
    schema: z.literal('pubchi-feed-proposal'),
    version: zVersion1,
    bot: zPubky,
    owner: zPubky,
    generated_at: zUnix,
    feed: ProposalFeedSchema,
    warnings: z.array(z.enum(['truncated-tags', 'name-trimmed'])).max(8),
    installed_user_feed_id: pubchiFeedIdSchema.nullable(),
  })
  .strict();

export type FeedProposalV1 = z.infer<typeof FeedProposalV1Schema>;

function isValidSocialFeed(proposal: z.infer<typeof ProposalFeedSchema> | FeedDraftV2): boolean {
  const { feed, name, icon } = proposal;
  return validateFeed({
    name,
    icon: icon ?? DEFAULT_CUSTOM_FEED_ICON,
    reach: feed.reach,
    sort: feed.sort,
    layout: feed.layout,
    content: feed.content ? toStoredPostKind(feed.content) : null,
    tags: feed.tags?.length ? feed.tags : null,
    domain_tags: feed.domain_tags?.length ? feed.domain_tags : null,
  }).success;
}

function mentionsLikes(feed: z.infer<typeof ProposalFeedSchema>): boolean {
  const values = [feed.feed.reach, feed.feed.sort, feed.feed.content, feed.feed.layout];
  return values.some((v) => typeof v === 'string' && v.toLowerCase() === 'likes');
}

export function parseFeedProposalV1(input: unknown): ParseResult<FeedProposalV1> {
  const shaped = fromZod(FeedProposalV1Schema, input);
  if (!shaped.ok) return shaped;
  const proposal = shaped.value;
  if (mentionsLikes(proposal.feed)) return err('FEED_UNSUPPORTED_LIKES');
  if (!(APP_SUPPORTED_REACH as readonly string[]).includes(proposal.feed.feed.reach)) {
    return err('FEED_UNSUPPORTED_REACH');
  }
  if (!(APP_SUPPORTED_SORT as readonly string[]).includes(proposal.feed.feed.sort)) {
    return err('FEED_SPECS_INVALID');
  }
  if (
    proposal.feed.feed.content !== undefined &&
    !(APP_SUPPORTED_CONTENT as readonly string[]).includes(proposal.feed.feed.content)
  ) {
    return err('FEED_SPECS_INVALID');
  }
  if (!isValidSocialFeed(proposal.feed)) return err('FEED_SPECS_INVALID');
  return ok(proposal);
}

const FeedConfigV2Schema = z
  .object({
    tags: z.array(z.string().min(1).max(20)).max(5).optional(),
    domain_tags: z.array(z.string().min(1).max(20)).max(5).optional(),
    reach: z.enum(APP_FEED_REACH),
    layout: z.enum(APP_SUPPORTED_LAYOUT),
    sort: z.enum(APP_SUPPORTED_SORT),
    content: z.enum(APP_FEED_CONTENT).optional(),
  })
  .strict();

export const FeedDraftV2Schema = z
  .object({
    name: z.string().min(1).max(100),
    icon: z.string().max(50),
    feed: FeedConfigV2Schema,
  })
  .strict();

const FeedMappingSchema = z
  .object({
    status: z.enum(['exact', 'adjusted', 'unsupported']),
    unmapped: z
      .array(
        z
          .object({
            request: z.string().min(1).max(200),
            reason: z.enum(['likes_unavailable', 'followers_not_authorable', 'unknown_content', 'ambiguous']),
            suggestion: z.string().max(240).optional(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

export const FeedProposalV2Schema = z
  .object({
    schema: z.literal('pubchi-feed-proposal'),
    version: z.literal(2),
    bot: zPubky,
    owner: zPubky,
    generated_at: zUnix,
    mode: z.enum(['create', 'update']),
    target_feed_id: pubchiFeedIdSchema.nullable(),
    feed: FeedDraftV2Schema,
    mapping: FeedMappingSchema,
    warnings: z.array(z.string().max(240)).max(8),
    installed_user_feed_id: pubchiFeedIdSchema.nullable(),
  })
  .strict();

export type FeedDraftV2 = z.infer<typeof FeedDraftV2Schema>;
export type FeedProposalV2 = z.infer<typeof FeedProposalV2Schema>;
export type FeedMappingV2 = z.infer<typeof FeedMappingSchema>;

export function parseFeedProposalV2(input: unknown): ParseResult<FeedProposalV2> {
  const shaped = fromZod(FeedProposalV2Schema, input);
  if (!shaped.ok) return shaped;
  const proposal = shaped.value;
  if (proposal.feed.feed.reach === 'followers' && proposal.mapping.status === 'exact') {
    return err('FEED_SPECS_INVALID');
  }
  if (proposal.feed.feed.content === 'unknown' && proposal.mapping.status === 'exact') {
    return err('FEED_SPECS_INVALID');
  }
  if (!isValidSocialFeed(proposal.feed)) return err('FEED_SPECS_INVALID');
  return ok(proposal);
}

export function parseFeedProposal(input: unknown): ParseResult<FeedProposalV1 | FeedProposalV2> {
  if (input === null || typeof input !== 'object' || Array.isArray(input) || !('version' in input)) {
    return err('SCHEMA_INVALID');
  }
  return (input as { version?: unknown }).version === 2 ? parseFeedProposalV2(input) : parseFeedProposalV1(input);
}
