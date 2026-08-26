// Consumed by VRT test harness (mockFeedApplication and Home.vrt.test.tsx).
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { homeInitialState, type HomeState } from '@/stores/home/home.types';
import { HOUR_MS, VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';

/**
 * Default Home filter state for the global feed snapshot:
 * columns layout, recent sort, all reach, all content kinds.
 * Mirrors `homeInitialState` while marking persistence as hydrated so the VRT
 * exercises the loaded Home UI.
 */
export const VRT_HOME_FILTERS = {
  ...homeInitialState,
  hasHydrated: true,
} satisfies HomeState;

/**
 * The set of saved feeds shown in the FeedNavigation tab strip.
 * The first entry is highlighted as the active feed in the global view.
 */
export const VRT_FEED_NAVIGATION: readonly FeedModelSchema[] = [
  {
    id: 'vrt-feed-global',
    name: 'Global',
    icon: 'globe',
    tags: [],
    domain_tags: [],
    reach: PubkyAppFeedReach.All,
    sort: PubkyAppFeedSort.Recent,
    content: null,
    layout: PubkyAppFeedLayout.Columns,
    created_at: VRT_FROZEN_NOW_MS - 30 * 24 * HOUR_MS,
    updated_at: VRT_FROZEN_NOW_MS - 30 * 24 * HOUR_MS,
  },
  {
    id: 'vrt-feed-following',
    name: 'Following',
    tags: [],
    domain_tags: [],
    reach: PubkyAppFeedReach.Following,
    sort: PubkyAppFeedSort.Recent,
    content: null,
    layout: PubkyAppFeedLayout.Columns,
    created_at: VRT_FROZEN_NOW_MS - 28 * 24 * HOUR_MS,
    updated_at: VRT_FROZEN_NOW_MS - 28 * 24 * HOUR_MS,
  },
  {
    id: 'vrt-feed-photography',
    name: 'Photography',
    icon: 'camera',
    tags: ['photography', 'goldenhour'],
    domain_tags: [],
    reach: PubkyAppFeedReach.All,
    sort: PubkyAppFeedSort.Popularity,
    content: null,
    layout: PubkyAppFeedLayout.Visual,
    created_at: VRT_FROZEN_NOW_MS - 14 * 24 * HOUR_MS,
    updated_at: VRT_FROZEN_NOW_MS - 14 * 24 * HOUR_MS,
  },
];
