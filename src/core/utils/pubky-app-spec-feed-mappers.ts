/**
 * Pubky App Spec Feed Mappers
 *
 * This utility provides bidirectional mapping between:
 * - Source 1: pubky-social-specs string unions
 *   - KnownFeedLayout, KnownFeedReach, KnownFeedSort, KnownPostKind
 * - Source 2: Home store types (src/core/stores/home/home.types.ts)
 *   - LAYOUT, REACH, SORT, CONTENT
 *
 * Purpose: Enable conversion between the external pubky-social-specs format and
 * the internal home store representation used throughout the application.
 *
 * Note: Some values don't have direct mappings and will return undefined:
 * - 'followers' has no home type equivalent
 * - CONTENT.ALL has no KnownPostKind equivalent
 */

import type { KnownFeedLayout, KnownFeedReach, KnownFeedSort, KnownPostKind } from 'pubky-social-specs';
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
 * Maps KnownFeedLayout to home LayoutType
 */
export function pubkyLayoutToHomeLayout(layout: KnownFeedLayout): LayoutType | undefined {
  switch (layout) {
    case 'columns':
      return LAYOUT.COLUMNS;
    case 'wide':
      return LAYOUT.WIDE;
    case 'list':
      return LAYOUT.LIST;
    case 'visual':
      return LAYOUT.VISUAL;
    case 'cards':
      return LAYOUT.CARDS;
    default:
      return undefined;
  }
}

/**
 * Maps home LayoutType to KnownFeedLayout
 */
export function homeLayoutToPubkyLayout(layout: LayoutType): KnownFeedLayout | undefined {
  switch (layout) {
    case LAYOUT.COLUMNS:
      return 'columns';
    case LAYOUT.WIDE:
      return 'wide';
    case LAYOUT.LIST:
      return 'list';
    case LAYOUT.VISUAL:
      return 'visual';
    case LAYOUT.CARDS:
      return 'cards';
    default:
      return undefined;
  }
}

// ============================================================================
// Reach Mappers
// ============================================================================

/**
 * Maps KnownFeedReach to home ReachType
 * Note: 'followers' has no home equivalent and returns undefined
 */
export function pubkyReachToHomeReach(reach: KnownFeedReach): ReachType | undefined {
  switch (reach) {
    case 'following':
      return REACH.FOLLOWING;
    case 'friends':
      return REACH.FRIENDS;
    case 'all':
      return REACH.ALL;
    case 'wot':
      return REACH.NETWORK;
    case 'me':
      return REACH.ME;
    case 'followers':
      // No home type equivalent for Followers
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Maps home ReachType to KnownFeedReach
 */
export function homeReachToPubkyReach(reach: ReachType): KnownFeedReach | undefined {
  switch (reach) {
    case REACH.FOLLOWING:
      return 'following';
    case REACH.FRIENDS:
      return 'friends';
    case REACH.ALL:
      return 'all';
    case REACH.NETWORK:
      return 'wot';
    case REACH.ME:
      return 'me';
    default:
      return undefined;
  }
}

// ============================================================================
// Sort Mappers
// ============================================================================

/**
 * Maps KnownFeedSort to home SortType
 */
export function pubkySortToHomeSort(sort: KnownFeedSort): SortType | undefined {
  switch (sort) {
    case 'recent':
      return SORT.TIMELINE;
    case 'popularity':
      return SORT.ENGAGEMENT;
    default:
      return undefined;
  }
}

/**
 * Maps home SortType to KnownFeedSort
 */
export function homeSortToPubkySort(sort: SortType): KnownFeedSort | undefined {
  switch (sort) {
    case SORT.TIMELINE:
      return 'recent';
    case SORT.ENGAGEMENT:
      return 'popularity';
    default:
      return undefined;
  }
}

// ============================================================================
// Content/PostKind Mappers
// ============================================================================

/**
 * Maps KnownPostKind to home ContentType
 */
export function pubkyPostKindToHomeContent(postKind: KnownPostKind): ContentType | undefined {
  switch (postKind) {
    case 'note':
      return CONTENT.SHORT;
    case 'article':
      return CONTENT.LONG;
    case 'image':
      return CONTENT.IMAGES;
    case 'video':
      return CONTENT.VIDEOS;
    case 'link':
      return CONTENT.LINKS;
    case 'file':
      return CONTENT.FILES;
    case 'collection':
      return CONTENT.COLLECTIONS;
    default:
      return undefined;
  }
}

/**
 * Maps home ContentType to KnownPostKind
 * Note: CONTENT.ALL has no KnownPostKind equivalent and returns undefined
 */
export function homeContentToPubkyPostKind(content: ContentType): KnownPostKind | undefined {
  switch (content) {
    case CONTENT.SHORT:
      return 'note';
    case CONTENT.LONG:
      return 'article';
    case CONTENT.IMAGES:
      return 'image';
    case CONTENT.VIDEOS:
      return 'video';
    case CONTENT.LINKS:
      return 'link';
    case CONTENT.FILES:
      return 'file';
    case CONTENT.COLLECTIONS:
      return 'collection';
    case CONTENT.ALL:
      // No KnownPostKind equivalent for ALL
      return undefined;
    default:
      return undefined;
  }
}
