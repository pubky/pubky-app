/**
 * Pubky App Spec Feed Mappers
 *
 * This utility provides bidirectional mapping between:
 * - Source 1: pubky-app-specs enums (node_modules/pubky-app-specs/pubky_app_specs.d.ts)
 *   - PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind
 * - Source 2: Home store types (src/core/stores/home/home.types.ts)
 *   - LAYOUT, REACH, SORT, CONTENT
 *
 * Purpose: Enable conversion between the external pubky-app-specs format and
 * the internal home store representation used throughout the application.
 *
 * Note: Some values don't have direct mappings and will return undefined:
 * - PubkyAppFeedReach.Followers has no home type equivalent
 * - CONTENT.ALL has no PubkyAppPostKind equivalent
 */

import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import {
  CONTENT,
  type ContentType,
  LAYOUT,
  type LayoutType,
  REACH,
  type ReachType,
  SORT,
  type SortType,
} from '@/stores/home/home.types';

// ============================================================================
// Layout Mappers
// ============================================================================

/**
 * Maps PubkyAppFeedLayout enum to home LayoutType
 */
export function pubkyLayoutToHomeLayout(layout: PubkyAppFeedLayout): LayoutType | undefined {
  switch (layout) {
    case PubkyAppFeedLayout.Columns:
      return LAYOUT.COLUMNS;
    case PubkyAppFeedLayout.Wide:
      return LAYOUT.WIDE;
    case PubkyAppFeedLayout.List:
      return LAYOUT.LIST;
    case PubkyAppFeedLayout.Visual:
      return LAYOUT.VISUAL;
    default:
      return undefined;
  }
}

/**
 * Maps home LayoutType to PubkyAppFeedLayout enum
 */
export function homeLayoutToPubkyLayout(layout: LayoutType): PubkyAppFeedLayout | undefined {
  switch (layout) {
    case LAYOUT.COLUMNS:
      return PubkyAppFeedLayout.Columns;
    case LAYOUT.WIDE:
      return PubkyAppFeedLayout.Wide;
    case LAYOUT.LIST:
      return PubkyAppFeedLayout.List;
    case LAYOUT.VISUAL:
      return PubkyAppFeedLayout.Visual;
    default:
      return undefined;
  }
}

// ============================================================================
// Reach Mappers
// ============================================================================

/**
 * Maps PubkyAppFeedReach enum to home ReachType
 * Note: PubkyAppFeedReach.Followers has no home equivalent and returns undefined
 */
export function pubkyReachToHomeReach(reach: PubkyAppFeedReach): ReachType | undefined {
  switch (reach) {
    case PubkyAppFeedReach.Following:
      return REACH.FOLLOWING;
    case PubkyAppFeedReach.Friends:
      return REACH.FRIENDS;
    case PubkyAppFeedReach.All:
      return REACH.ALL;
    case PubkyAppFeedReach.Wot:
      return REACH.NETWORK;
    case PubkyAppFeedReach.Me:
      return REACH.ME;
    case PubkyAppFeedReach.Followers:
      // No home type equivalent for Followers
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Maps home ReachType to PubkyAppFeedReach enum
 */
export function homeReachToPubkyReach(reach: ReachType): PubkyAppFeedReach | undefined {
  switch (reach) {
    case REACH.FOLLOWING:
      return PubkyAppFeedReach.Following;
    case REACH.FRIENDS:
      return PubkyAppFeedReach.Friends;
    case REACH.ALL:
      return PubkyAppFeedReach.All;
    case REACH.NETWORK:
      return PubkyAppFeedReach.Wot;
    case REACH.ME:
      return PubkyAppFeedReach.Me;
    default:
      return undefined;
  }
}

// ============================================================================
// Sort Mappers
// ============================================================================

/**
 * Maps PubkyAppFeedSort enum to home SortType
 */
export function pubkySortToHomeSort(sort: PubkyAppFeedSort): SortType | undefined {
  switch (sort) {
    case PubkyAppFeedSort.Recent:
      return SORT.TIMELINE;
    case PubkyAppFeedSort.Popularity:
      return SORT.ENGAGEMENT;
    default:
      return undefined;
  }
}

/**
 * Maps home SortType to PubkyAppFeedSort enum
 */
export function homeSortToPubkySort(sort: SortType): PubkyAppFeedSort | undefined {
  switch (sort) {
    case SORT.TIMELINE:
      return PubkyAppFeedSort.Recent;
    case SORT.ENGAGEMENT:
      return PubkyAppFeedSort.Popularity;
    default:
      return undefined;
  }
}

// ============================================================================
// Content/PostKind Mappers
// ============================================================================

/**
 * Maps PubkyAppPostKind enum to home ContentType
 */
export function pubkyPostKindToHomeContent(postKind: PubkyAppPostKind): ContentType | undefined {
  switch (postKind) {
    case PubkyAppPostKind.Short:
      return CONTENT.SHORT;
    case PubkyAppPostKind.Long:
      return CONTENT.LONG;
    case PubkyAppPostKind.Image:
      return CONTENT.IMAGES;
    case PubkyAppPostKind.Video:
      return CONTENT.VIDEOS;
    case PubkyAppPostKind.Link:
      return CONTENT.LINKS;
    case PubkyAppPostKind.File:
      return CONTENT.FILES;
    case PubkyAppPostKind.Collection:
      return CONTENT.COLLECTIONS;
    default:
      return undefined;
  }
}

/**
 * Maps home ContentType to PubkyAppPostKind enum
 * Note: CONTENT.ALL has no PubkyAppPostKind equivalent and returns undefined
 */
export function homeContentToPubkyPostKind(content: ContentType): PubkyAppPostKind | undefined {
  switch (content) {
    case CONTENT.SHORT:
      return PubkyAppPostKind.Short;
    case CONTENT.LONG:
      return PubkyAppPostKind.Long;
    case CONTENT.IMAGES:
      return PubkyAppPostKind.Image;
    case CONTENT.VIDEOS:
      return PubkyAppPostKind.Video;
    case CONTENT.LINKS:
      return PubkyAppPostKind.Link;
    case CONTENT.FILES:
      return PubkyAppPostKind.File;
    case CONTENT.COLLECTIONS:
      return PubkyAppPostKind.Collection;
    case CONTENT.ALL:
      // No PubkyAppPostKind equivalent for ALL
      return undefined;
    default:
      return undefined;
  }
}
