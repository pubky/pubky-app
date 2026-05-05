import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { describe, expect, it } from 'vitest';
import { CONTENT, LAYOUT, REACH, SORT } from '@/stores/home/home.types';
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
      it('should map PubkyAppFeedLayout.Columns to LAYOUT.COLUMNS', () => {
        expect(pubkyLayoutToHomeLayout(PubkyAppFeedLayout.Columns)).toBe(LAYOUT.COLUMNS);
      });

      it('should map PubkyAppFeedLayout.Wide to LAYOUT.WIDE', () => {
        expect(pubkyLayoutToHomeLayout(PubkyAppFeedLayout.Wide)).toBe(LAYOUT.WIDE);
      });

      it('should map PubkyAppFeedLayout.Visual to LAYOUT.VISUAL', () => {
        expect(pubkyLayoutToHomeLayout(PubkyAppFeedLayout.Visual)).toBe(LAYOUT.VISUAL);
      });

      it('should return undefined for unknown layout values', () => {
        expect(pubkyLayoutToHomeLayout(999 as PubkyAppFeedLayout)).toBeUndefined();
      });
    });

    describe('homeLayoutToPubkyLayout', () => {
      it('should map LAYOUT.COLUMNS to PubkyAppFeedLayout.Columns', () => {
        expect(homeLayoutToPubkyLayout(LAYOUT.COLUMNS)).toBe(PubkyAppFeedLayout.Columns);
      });

      it('should map LAYOUT.WIDE to PubkyAppFeedLayout.Wide', () => {
        expect(homeLayoutToPubkyLayout(LAYOUT.WIDE)).toBe(PubkyAppFeedLayout.Wide);
      });

      it('should map LAYOUT.VISUAL to PubkyAppFeedLayout.Visual', () => {
        expect(homeLayoutToPubkyLayout(LAYOUT.VISUAL)).toBe(PubkyAppFeedLayout.Visual);
      });

      it('should return undefined for unknown layout values', () => {
        // @ts-expect-error Testing invalid input
        expect(homeLayoutToPubkyLayout('unknown')).toBeUndefined();
      });
    });

    describe('Layout bidirectional mapping', () => {
      it('should be reversible for all valid layouts', () => {
        const layouts = [PubkyAppFeedLayout.Columns, PubkyAppFeedLayout.Wide, PubkyAppFeedLayout.Visual];

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
      it('should map PubkyAppFeedReach.Following to REACH.FOLLOWING', () => {
        expect(pubkyReachToHomeReach(PubkyAppFeedReach.Following)).toBe(REACH.FOLLOWING);
      });

      it('should map PubkyAppFeedReach.Friends to REACH.FRIENDS', () => {
        expect(pubkyReachToHomeReach(PubkyAppFeedReach.Friends)).toBe(REACH.FRIENDS);
      });

      it('should map PubkyAppFeedReach.All to REACH.ALL', () => {
        expect(pubkyReachToHomeReach(PubkyAppFeedReach.All)).toBe(REACH.ALL);
      });

      it('should return undefined for PubkyAppFeedReach.Followers (no home equivalent)', () => {
        expect(pubkyReachToHomeReach(PubkyAppFeedReach.Followers)).toBeUndefined();
      });

      it('should return undefined for unknown reach values', () => {
        expect(pubkyReachToHomeReach(999 as PubkyAppFeedReach)).toBeUndefined();
      });
    });

    describe('homeReachToPubkyReach', () => {
      it('should map REACH.FOLLOWING to PubkyAppFeedReach.Following', () => {
        expect(homeReachToPubkyReach(REACH.FOLLOWING)).toBe(PubkyAppFeedReach.Following);
      });

      it('should map REACH.FRIENDS to PubkyAppFeedReach.Friends', () => {
        expect(homeReachToPubkyReach(REACH.FRIENDS)).toBe(PubkyAppFeedReach.Friends);
      });

      it('should map REACH.ALL to PubkyAppFeedReach.All', () => {
        expect(homeReachToPubkyReach(REACH.ALL)).toBe(PubkyAppFeedReach.All);
      });

      it('should return undefined for unknown reach values', () => {
        // @ts-expect-error Testing invalid input
        expect(homeReachToPubkyReach('unknown')).toBeUndefined();
      });
    });

    describe('Reach bidirectional mapping', () => {
      it('should be reversible for mappable reach values', () => {
        // Note: Followers is excluded because it has no home equivalent
        const reaches = [PubkyAppFeedReach.Following, PubkyAppFeedReach.Friends, PubkyAppFeedReach.All];

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
      it('should map PubkyAppFeedSort.Recent to SORT.TIMELINE', () => {
        expect(pubkySortToHomeSort(PubkyAppFeedSort.Recent)).toBe(SORT.TIMELINE);
      });

      it('should map PubkyAppFeedSort.Popularity to SORT.ENGAGEMENT', () => {
        expect(pubkySortToHomeSort(PubkyAppFeedSort.Popularity)).toBe(SORT.ENGAGEMENT);
      });

      it('should return undefined for unknown sort values', () => {
        expect(pubkySortToHomeSort(999 as PubkyAppFeedSort)).toBeUndefined();
      });
    });

    describe('homeSortToPubkySort', () => {
      it('should map SORT.TIMELINE to PubkyAppFeedSort.Recent', () => {
        expect(homeSortToPubkySort(SORT.TIMELINE)).toBe(PubkyAppFeedSort.Recent);
      });

      it('should map SORT.ENGAGEMENT to PubkyAppFeedSort.Popularity', () => {
        expect(homeSortToPubkySort(SORT.ENGAGEMENT)).toBe(PubkyAppFeedSort.Popularity);
      });

      it('should return undefined for unknown sort values', () => {
        // @ts-expect-error Testing invalid input
        expect(homeSortToPubkySort('unknown')).toBeUndefined();
      });
    });

    describe('Sort bidirectional mapping', () => {
      it('should be reversible for all valid sorts', () => {
        const sorts = [PubkyAppFeedSort.Recent, PubkyAppFeedSort.Popularity];

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
      it('should map PubkyAppPostKind.Short to CONTENT.SHORT', () => {
        expect(pubkyPostKindToHomeContent(PubkyAppPostKind.Short)).toBe(CONTENT.SHORT);
      });

      it('should map PubkyAppPostKind.Long to CONTENT.LONG', () => {
        expect(pubkyPostKindToHomeContent(PubkyAppPostKind.Long)).toBe(CONTENT.LONG);
      });

      it('should map PubkyAppPostKind.Image to CONTENT.IMAGES', () => {
        expect(pubkyPostKindToHomeContent(PubkyAppPostKind.Image)).toBe(CONTENT.IMAGES);
      });

      it('should map PubkyAppPostKind.Video to CONTENT.VIDEOS', () => {
        expect(pubkyPostKindToHomeContent(PubkyAppPostKind.Video)).toBe(CONTENT.VIDEOS);
      });

      it('should map PubkyAppPostKind.Link to CONTENT.LINKS', () => {
        expect(pubkyPostKindToHomeContent(PubkyAppPostKind.Link)).toBe(CONTENT.LINKS);
      });

      it('should map PubkyAppPostKind.File to CONTENT.FILES', () => {
        expect(pubkyPostKindToHomeContent(PubkyAppPostKind.File)).toBe(CONTENT.FILES);
      });

      it('should return undefined for unknown post kind values', () => {
        expect(pubkyPostKindToHomeContent(999 as PubkyAppPostKind)).toBeUndefined();
      });
    });

    describe('homeContentToPubkyPostKind', () => {
      it('should map CONTENT.SHORT to PubkyAppPostKind.Short', () => {
        expect(homeContentToPubkyPostKind(CONTENT.SHORT)).toBe(PubkyAppPostKind.Short);
      });

      it('should map CONTENT.LONG to PubkyAppPostKind.Long', () => {
        expect(homeContentToPubkyPostKind(CONTENT.LONG)).toBe(PubkyAppPostKind.Long);
      });

      it('should map CONTENT.IMAGES to PubkyAppPostKind.Image', () => {
        expect(homeContentToPubkyPostKind(CONTENT.IMAGES)).toBe(PubkyAppPostKind.Image);
      });

      it('should map CONTENT.VIDEOS to PubkyAppPostKind.Video', () => {
        expect(homeContentToPubkyPostKind(CONTENT.VIDEOS)).toBe(PubkyAppPostKind.Video);
      });

      it('should map CONTENT.LINKS to PubkyAppPostKind.Link', () => {
        expect(homeContentToPubkyPostKind(CONTENT.LINKS)).toBe(PubkyAppPostKind.Link);
      });

      it('should map CONTENT.FILES to PubkyAppPostKind.File', () => {
        expect(homeContentToPubkyPostKind(CONTENT.FILES)).toBe(PubkyAppPostKind.File);
      });

      it('should return undefined for CONTENT.ALL (no PubkyAppPostKind equivalent)', () => {
        expect(homeContentToPubkyPostKind(CONTENT.ALL)).toBeUndefined();
      });

      it('should return undefined for unknown content values', () => {
        // @ts-expect-error Testing invalid input
        expect(homeContentToPubkyPostKind('unknown')).toBeUndefined();
      });
    });

    describe('Content/PostKind bidirectional mapping', () => {
      it('should be reversible for mappable post kinds', () => {
        const postKinds = [
          PubkyAppPostKind.Short,
          PubkyAppPostKind.Long,
          PubkyAppPostKind.Image,
          PubkyAppPostKind.Video,
          PubkyAppPostKind.Link,
          PubkyAppPostKind.File,
        ];

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
