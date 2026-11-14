import type { KnownFeedLayout, KnownFeedReach, KnownFeedSort, KnownPostKind } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import { CONTENT, LAYOUT, REACH, SORT } from '@/stores/home/home.types';
import { asInvalid } from '@/test-utils/type-assertions';
import {
  homeContentToPubkyPostKind,
  homeLayoutToPubkyLayout,
  homeReachToPubkyReach,
  homeSortToPubkySort,
  pubkyLayoutToHomeLayout,
  pubkyPostKindToHomeContent,
  pubkyReachToHomeReach,
  pubkySortToHomeSort,
} from './pubky-app-spec-feed-mappers';

describe('pubky-app-spec-feed-mappers', () => {
  describe('Layout Mappers', () => {
    describe('pubkyLayoutToHomeLayout', () => {
      it('should map columns to LAYOUT.COLUMNS', () => {
        expect(pubkyLayoutToHomeLayout('columns')).toBe(LAYOUT.COLUMNS);
      });

      it('should map wide to LAYOUT.WIDE', () => {
        expect(pubkyLayoutToHomeLayout('wide')).toBe(LAYOUT.WIDE);
      });

      it('should map visual to LAYOUT.VISUAL', () => {
        expect(pubkyLayoutToHomeLayout('visual')).toBe(LAYOUT.VISUAL);
      });

      it('should return undefined for unknown layout values', () => {
        expect(pubkyLayoutToHomeLayout(asInvalid<KnownFeedLayout>('a-newer-name'))).toBeUndefined();
      });
    });

    describe('homeLayoutToPubkyLayout', () => {
      it('should map LAYOUT.COLUMNS to columns', () => {
        expect(homeLayoutToPubkyLayout(LAYOUT.COLUMNS)).toBe('columns');
      });

      it('should map LAYOUT.WIDE to wide', () => {
        expect(homeLayoutToPubkyLayout(LAYOUT.WIDE)).toBe('wide');
      });

      it('should map LAYOUT.VISUAL to visual', () => {
        expect(homeLayoutToPubkyLayout(LAYOUT.VISUAL)).toBe('visual');
      });

      it('should return undefined for unknown layout values', () => {
        // @ts-expect-error Testing invalid input
        expect(homeLayoutToPubkyLayout('unknown')).toBeUndefined();
      });
    });

    describe('Layout bidirectional mapping', () => {
      it('should be reversible for all valid layouts', () => {
        const layouts: KnownFeedLayout[] = ['columns', 'wide', 'visual', 'list', 'cards'];

        for (const pubkyLayout of layouts) {
          const homeLayout = pubkyLayoutToHomeLayout(pubkyLayout);
          expect(homeLayout).toBeDefined();
          expect(homeLayoutToPubkyLayout(homeLayout!)).toBe(pubkyLayout);
        }
      });
    });
  });

  describe('Reach Mappers', () => {
    describe('pubkyReachToHomeReach', () => {
      it('should map following to REACH.FOLLOWING', () => {
        expect(pubkyReachToHomeReach('following')).toBe(REACH.FOLLOWING);
      });

      it('should map friends to REACH.FRIENDS', () => {
        expect(pubkyReachToHomeReach('friends')).toBe(REACH.FRIENDS);
      });

      it('should map all to REACH.ALL', () => {
        expect(pubkyReachToHomeReach('all')).toBe(REACH.ALL);
      });

      it('should map wot to REACH.NETWORK', () => {
        expect(pubkyReachToHomeReach('wot')).toBe(REACH.NETWORK);
      });

      it('should map me to REACH.ME', () => {
        expect(pubkyReachToHomeReach('me')).toBe(REACH.ME);
      });

      it('should return undefined for followers (no home equivalent)', () => {
        expect(pubkyReachToHomeReach('followers')).toBeUndefined();
      });

      it('should return undefined for unknown reach values', () => {
        expect(pubkyReachToHomeReach(asInvalid<KnownFeedReach>('a-newer-name'))).toBeUndefined();
      });
    });

    describe('homeReachToPubkyReach', () => {
      it('should map REACH.FOLLOWING to following', () => {
        expect(homeReachToPubkyReach(REACH.FOLLOWING)).toBe('following');
      });

      it('should map REACH.FRIENDS to friends', () => {
        expect(homeReachToPubkyReach(REACH.FRIENDS)).toBe('friends');
      });

      it('should map REACH.ALL to all', () => {
        expect(homeReachToPubkyReach(REACH.ALL)).toBe('all');
      });

      it('should map REACH.NETWORK to wot', () => {
        expect(homeReachToPubkyReach(REACH.NETWORK)).toBe('wot');
      });

      it('should map REACH.ME to me', () => {
        expect(homeReachToPubkyReach(REACH.ME)).toBe('me');
      });

      it('should return undefined for unknown reach values', () => {
        // @ts-expect-error Testing invalid input
        expect(homeReachToPubkyReach('unknown')).toBeUndefined();
      });
    });

    describe('Reach bidirectional mapping', () => {
      it('should be reversible for mappable reach values', () => {
        // Note: Followers is excluded because it has no home equivalent
        const reaches: KnownFeedReach[] = ['following', 'friends', 'all', 'wot', 'me'];

        for (const pubkyReach of reaches) {
          const homeReach = pubkyReachToHomeReach(pubkyReach);
          expect(homeReach).toBeDefined();
          expect(homeReachToPubkyReach(homeReach!)).toBe(pubkyReach);
        }
      });
    });
  });

  describe('Sort Mappers', () => {
    describe('pubkySortToHomeSort', () => {
      it('should map recent to SORT.TIMELINE', () => {
        expect(pubkySortToHomeSort('recent')).toBe(SORT.TIMELINE);
      });

      it('should map popularity to SORT.ENGAGEMENT', () => {
        expect(pubkySortToHomeSort('popularity')).toBe(SORT.ENGAGEMENT);
      });

      it('should return undefined for unknown sort values', () => {
        expect(pubkySortToHomeSort(asInvalid<KnownFeedSort>('a-newer-name'))).toBeUndefined();
      });
    });

    describe('homeSortToPubkySort', () => {
      it('should map SORT.TIMELINE to recent', () => {
        expect(homeSortToPubkySort(SORT.TIMELINE)).toBe('recent');
      });

      it('should map SORT.ENGAGEMENT to popularity', () => {
        expect(homeSortToPubkySort(SORT.ENGAGEMENT)).toBe('popularity');
      });

      it('should return undefined for unknown sort values', () => {
        // @ts-expect-error Testing invalid input
        expect(homeSortToPubkySort('unknown')).toBeUndefined();
      });
    });

    describe('Sort bidirectional mapping', () => {
      it('should be reversible for all valid sorts', () => {
        const sorts: KnownFeedSort[] = ['recent', 'popularity'];

        for (const pubkySort of sorts) {
          const homeSort = pubkySortToHomeSort(pubkySort);
          expect(homeSort).toBeDefined();
          expect(homeSortToPubkySort(homeSort!)).toBe(pubkySort);
        }
      });
    });
  });

  describe('Content/PostKind Mappers', () => {
    describe('pubkyPostKindToHomeContent', () => {
      it('should map note to CONTENT.SHORT', () => {
        expect(pubkyPostKindToHomeContent('note')).toBe(CONTENT.SHORT);
      });

      it('should map article to CONTENT.LONG', () => {
        expect(pubkyPostKindToHomeContent('article')).toBe(CONTENT.LONG);
      });

      it('should map image to CONTENT.IMAGES', () => {
        expect(pubkyPostKindToHomeContent('image')).toBe(CONTENT.IMAGES);
      });

      it('should map video to CONTENT.VIDEOS', () => {
        expect(pubkyPostKindToHomeContent('video')).toBe(CONTENT.VIDEOS);
      });

      it('should map link to CONTENT.LINKS', () => {
        expect(pubkyPostKindToHomeContent('link')).toBe(CONTENT.LINKS);
      });

      it('should map file to CONTENT.FILES', () => {
        expect(pubkyPostKindToHomeContent('file')).toBe(CONTENT.FILES);
      });

      it('should map collection to CONTENT.COLLECTIONS', () => {
        expect(pubkyPostKindToHomeContent('collection')).toBe(CONTENT.COLLECTIONS);
      });

      it('should return undefined for unknown post kind values', () => {
        expect(pubkyPostKindToHomeContent(asInvalid<KnownPostKind>('a-newer-name'))).toBeUndefined();
      });
    });

    describe('homeContentToPubkyPostKind', () => {
      it('should map CONTENT.SHORT to note', () => {
        expect(homeContentToPubkyPostKind(CONTENT.SHORT)).toBe('note');
      });

      it('should map CONTENT.LONG to article', () => {
        expect(homeContentToPubkyPostKind(CONTENT.LONG)).toBe('article');
      });

      it('should map CONTENT.IMAGES to image', () => {
        expect(homeContentToPubkyPostKind(CONTENT.IMAGES)).toBe('image');
      });

      it('should map CONTENT.VIDEOS to video', () => {
        expect(homeContentToPubkyPostKind(CONTENT.VIDEOS)).toBe('video');
      });

      it('should map CONTENT.LINKS to link', () => {
        expect(homeContentToPubkyPostKind(CONTENT.LINKS)).toBe('link');
      });

      it('should map CONTENT.FILES to file', () => {
        expect(homeContentToPubkyPostKind(CONTENT.FILES)).toBe('file');
      });

      it('should map CONTENT.COLLECTIONS to collection', () => {
        expect(homeContentToPubkyPostKind(CONTENT.COLLECTIONS)).toBe('collection');
      });

      it('should return undefined for CONTENT.ALL (no KnownPostKind equivalent)', () => {
        expect(homeContentToPubkyPostKind(CONTENT.ALL)).toBeUndefined();
      });

      it('should return undefined for unknown content values', () => {
        // @ts-expect-error Testing invalid input
        expect(homeContentToPubkyPostKind('unknown')).toBeUndefined();
      });
    });

    describe('Content/PostKind bidirectional mapping', () => {
      it('should be reversible for mappable post kinds', () => {
        const postKinds: KnownPostKind[] = ['note', 'article', 'image', 'video', 'link', 'file', 'collection'];

        for (const pubkyPostKind of postKinds) {
          const homeContent = pubkyPostKindToHomeContent(pubkyPostKind);
          expect(homeContent).toBeDefined();
          expect(homeContentToPubkyPostKind(homeContent!)).toBe(pubkyPostKind);
        }
      });

      it('should be reversible for mappable content types (excluding ALL)', () => {
        const contentTypes = [
          CONTENT.SHORT,
          CONTENT.LONG,
          CONTENT.IMAGES,
          CONTENT.VIDEOS,
          CONTENT.LINKS,
          CONTENT.FILES,
          CONTENT.COLLECTIONS,
        ];

        for (const homeContent of contentTypes) {
          const pubkyPostKind = homeContentToPubkyPostKind(homeContent);
          expect(pubkyPostKind).toBeDefined();
          expect(pubkyPostKindToHomeContent(pubkyPostKind!)).toBe(homeContent);
        }
      });
    });
  });
});
