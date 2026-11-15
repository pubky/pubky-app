import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import { describe, expect, it } from 'vitest';
import { feedProposalToCreateParams, feedProposalV2ToCreateParams } from './feed-map';
import type { FeedProposalV1, FeedProposalV2 } from './schemas/feed';
import { parseFeedProposal } from './schemas/feed';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

function proposal(reach: string, sort: string, layout: 'columns' | 'wide' | 'visual' | 'list'): FeedProposalV1 {
  return {
    schema: 'pubchi-feed-proposal',
    version: 1,
    bot: OWNER,
    owner: OWNER,
    generated_at: 10,
    feed: {
      name: 'Builders',
      created_at: 10,
      feed: { tags: ['builder'], reach, layout, sort },
    },
    warnings: [],
    installed_user_feed_id: null,
  };
}

function proposalV2(overrides: Partial<FeedProposalV2['feed']['feed']> = {}): FeedProposalV2 {
  return {
    schema: 'pubchi-feed-proposal',
    version: 2,
    bot: OWNER,
    owner: OWNER,
    generated_at: 10,
    mode: 'create',
    target_feed_id: null,
    feed: {
      name: 'Builders',
      icon: 'feed',
      feed: { reach: 'following', sort: 'recent', layout: 'columns', ...overrides },
    },
    mapping: { status: 'exact', unmapped: [] },
    warnings: [],
    installed_user_feed_id: null,
  };
}

describe('feedProposalToCreateParams', () => {
  it('maps following/recent/columns even when those enums are 0', () => {
    const params = feedProposalToCreateParams(proposal('following', 'recent', 'columns'));
    expect(params.reach).toBe(PubkyAppFeedReach.Following);
    expect(params.sort).toBe(PubkyAppFeedSort.Recent);
    expect(params.layout).toBe(PubkyAppFeedLayout.Columns);
    expect(params.name).toBe('Builders');
    expect(params.tags).toEqual(['builder']);
  });

  it('rejects an unknown reach', () => {
    expect(() => feedProposalToCreateParams(proposal('likes', 'recent', 'columns'))).toThrow('FEED_SPECS_INVALID');
  });

  it.each([
    ['following', 'recent', 'columns', 'short'],
    ['friends', 'recent', 'visual', 'image'],
    ['all', 'popularity', 'list', 'video'],
    ['wot', 'recent', 'columns', 'link'],
    ['me', 'popularity', 'wide', 'file'],
    ['following', 'recent', 'visual', 'collection'],
  ] as const)('maps every specs enum value: %s/%s/%s/%s', (reach, sort, layout, content) => {
    const input = proposalV2({ reach, sort, layout, content });
    const parsed = parseFeedProposal(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.value.version !== 2) return;
    const mapped = feedProposalV2ToCreateParams(parsed.value);
    expect(mapped.canApply).toBe(true);
    expect(mapped.reasons).toEqual([]);
    expect(mapped.params).toMatchObject({ name: 'Builders', tags: [], domain_tags: [] });
  });

  it('blocks followers reach while preserving typed mapping data', () => {
    const proposal = {
      ...proposalV2({ reach: 'followers' }),
      mapping: {
        status: 'adjusted' as const,
        unmapped: [{ request: 'followers', reason: 'followers_not_authorable' as const }],
      },
    };
    const parsed = parseFeedProposal(proposal);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.value.version !== 2) return;
    const mapped = feedProposalV2ToCreateParams(parsed.value);
    expect(mapped.canApply).toBe(false);
    expect(mapped.reasons).toContain('followers_not_authorable');
    expect(mapped.mapping.unmapped[0]?.reason).toBe('followers_not_authorable');
  });

  it('blocks any unmapped request', () => {
    const mapped = feedProposalV2ToCreateParams({
      ...proposalV2(),
      mapping: {
        status: 'adjusted',
        unmapped: [{ request: 'likes', reason: 'likes_unavailable', suggestion: 'Popularity' }],
      },
      warnings: ['Likes are not available'],
    });
    expect(mapped.canApply).toBe(false);
    expect(mapped.reasons).toContain('unmapped');
    expect(mapped.mapping.unmapped[0]?.reason).toBe('likes_unavailable');
    expect(mapped.warnings).toEqual(['Likes are not available']);
  });
});
