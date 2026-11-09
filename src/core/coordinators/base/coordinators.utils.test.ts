import { describe, expect, it } from 'vitest';
import {
  compareEventCursors,
  earliestEventCursor,
  matchesEventPath,
  routeToRegex,
} from '@/coordinators/base/coordinators.utils';

describe('coordinators.utils', () => {
  describe('routeToRegex', () => {
    it('matches routes starting with the path and escapes regex characters', () => {
      expect(routeToRegex('/sign-in').test('/sign-in/recovery')).toBe(true);
      expect(routeToRegex('/a.b').test('/axb')).toBe(false);
    });
  });

  describe('compareEventCursors', () => {
    it('orders decimal event ids numerically, beyond the safe integer range', () => {
      expect(compareEventCursors('9', '10')).toBe(-1);
      expect(compareEventCursors('10', '10')).toBe(0);
      expect(compareEventCursors('18446744073709551615', '18446744073709551614')).toBe(1);
    });

    it('cannot order a cursor that is not a decimal event id', () => {
      expect(compareEventCursors('c1', '10')).toBeUndefined();
      expect(compareEventCursors('10', '')).toBeUndefined();
    });
  });

  describe('earliestEventCursor', () => {
    it('returns the earliest cursor', () => {
      expect(earliestEventCursor(['120', '95', '300'])).toBe('95');
    });

    it('replays from the start when any cursor is missing', () => {
      expect(earliestEventCursor(['120', null])).toBeNull();
    });

    it('replays from the start when two cursors cannot be ordered, but keeps a single opaque cursor', () => {
      expect(earliestEventCursor(['c1', '95'])).toBeNull();
      expect(earliestEventCursor(['c1'])).toBe('c1');
      expect(earliestEventCursor(['c1', 'c1'])).toBe('c1');
    });
  });

  describe('matchesEventPath', () => {
    it('matches a directory subtree for a trailing slash and one exact file otherwise', () => {
      expect(matchesEventPath('/pub/pubky.app/mutes/', '/pub/pubky.app/mutes/abc')).toBe(true);
      expect(matchesEventPath('/pub/pubky.app/mutes/', '/pub/pubky.app/muted')).toBe(false);
      expect(matchesEventPath('/pub/pubky.app/last_read', '/pub/pubky.app/last_read')).toBe(true);
      expect(matchesEventPath('/pub/pubky.app/last_read', '/pub/pubky.app/last_read.bak')).toBe(false);
    });
  });
});
