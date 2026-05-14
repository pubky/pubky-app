import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKER_TTL_MS, VIEWER_TAG_MARKER_STORAGE_PREFIX } from '@/config/viewerTagMarker';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { ViewerTagMarkerStorage } from './viewerTagMarkerStorage';

const VIEWER_A = 'viewer-a' as Pubky;
const VIEWER_B = 'viewer-b' as Pubky;
const POST_ID = 'author:post123';

// Build the raw sessionStorage key the same way the helper does internally — used
// for direct sessionStorage assertions.
const buildKey = (viewer: Pubky, postId: string, label: string) =>
  `${VIEWER_TAG_MARKER_STORAGE_PREFIX}${viewer}:${postId}:${label.toLowerCase()}`;

describe('ViewerTagMarkerStorage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('set + get', () => {
    it('round-trips a PUT (viewer added) marker', () => {
      ViewerTagMarkerStorage.set({ pubky: VIEWER_A, postId: POST_ID, label: 'abc', op: HttpMethod.PUT });

      const marker = ViewerTagMarkerStorage.get({ pubky: VIEWER_A, postId: POST_ID, label: 'abc' });
      expect(marker?.op).toBe(HttpMethod.PUT);
    });

    it('round-trips a DELETE (viewer removed) marker', () => {
      ViewerTagMarkerStorage.set({ pubky: VIEWER_A, postId: POST_ID, label: 'abc', op: HttpMethod.DELETE });

      const marker = ViewerTagMarkerStorage.get({ pubky: VIEWER_A, postId: POST_ID, label: 'abc' });
      expect(marker?.op).toBe(HttpMethod.DELETE);
    });

    it('returns null when no marker exists', () => {
      const marker = ViewerTagMarkerStorage.get({ pubky: VIEWER_A, postId: POST_ID, label: 'abc' });
      expect(marker).toBeNull();
    });

    // Local writes come through TagNormalizer with a lowercased label, but Nexus
    // responses can use any case. Storage normalizes at the boundary so reads
    // match writes regardless.
    it('normalizes the label so set and get match regardless of case', () => {
      ViewerTagMarkerStorage.set({ pubky: VIEWER_A, postId: POST_ID, label: 'ABC', op: HttpMethod.PUT });

      // Direct check: the raw sessionStorage key uses the lowercased label,
      // and the uppercase variant is never stored.
      const lowercaseKey = `${VIEWER_TAG_MARKER_STORAGE_PREFIX}${VIEWER_A}:${POST_ID}:abc`;
      const uppercaseKey = `${VIEWER_TAG_MARKER_STORAGE_PREFIX}${VIEWER_A}:${POST_ID}:ABC`;
      expect(window.sessionStorage.getItem(lowercaseKey)).not.toBeNull();
      expect(window.sessionStorage.getItem(uppercaseKey)).toBeNull();

      // And `get` finds the same marker whether the caller passes 'abc' or 'ABC'.
      expect(ViewerTagMarkerStorage.get({ pubky: VIEWER_A, postId: POST_ID, label: 'abc' })?.op).toBe(HttpMethod.PUT);
      expect(ViewerTagMarkerStorage.get({ pubky: VIEWER_A, postId: POST_ID, label: 'ABC' })?.op).toBe(HttpMethod.PUT);
    });
  });

  describe('expiry (TTL)', () => {
    it('returns null and removes the key once expiresAt has passed', () => {
      const start = 1_000_000;
      vi.useFakeTimers();
      vi.setSystemTime(start);

      ViewerTagMarkerStorage.set({ pubky: VIEWER_A, postId: POST_ID, label: 'abc', op: HttpMethod.PUT });

      // Step past the TTL window — Nexus is assumed to have caught up by now.
      vi.setSystemTime(start + MARKER_TTL_MS + 1);

      expect(ViewerTagMarkerStorage.get({ pubky: VIEWER_A, postId: POST_ID, label: 'abc' })).toBeNull();
      // The expired key should be cleaned out of sessionStorage as a side effect (lazy GC).
      expect(window.sessionStorage.getItem(buildKey(VIEWER_A, POST_ID, 'abc'))).toBeNull();
    });
  });

  describe('defensive handling', () => {
    it('returns null and removes the entry when stored JSON is corrupted', () => {
      const key = buildKey(VIEWER_A, POST_ID, 'abc');
      // Plant invalid JSON to simulate a corrupted entry.
      window.sessionStorage.setItem(key, '{not valid json');

      expect(ViewerTagMarkerStorage.get({ pubky: VIEWER_A, postId: POST_ID, label: 'abc' })).toBeNull();
      expect(window.sessionStorage.getItem(key)).toBeNull();
    });

    it('returns null and removes the entry when op is not PUT or DELETE', () => {
      // A garbage `op` value mustn't be treated as a valid marker — otherwise
      // mergeTags would silently fall through to "DELETE behavior" since
      // `marker.op === HttpMethod.PUT` is false.
      const key = buildKey(VIEWER_A, POST_ID, 'abc');
      window.sessionStorage.setItem(
        key,
        JSON.stringify({ op: 'NOT_A_METHOD', ts: Date.now(), expiresAt: Date.now() + 60_000 }),
      );

      expect(ViewerTagMarkerStorage.get({ pubky: VIEWER_A, postId: POST_ID, label: 'abc' })).toBeNull();
      expect(window.sessionStorage.getItem(key)).toBeNull();
    });

    it('returns null and removes the entry when required fields are missing or wrong type', () => {
      const key = buildKey(VIEWER_A, POST_ID, 'abc');
      window.sessionStorage.setItem(
        key,
        // Missing `ts`, expiresAt is a string instead of a number.
        JSON.stringify({ op: HttpMethod.PUT, expiresAt: '2099-01-01' }),
      );

      expect(ViewerTagMarkerStorage.get({ pubky: VIEWER_A, postId: POST_ID, label: 'abc' })).toBeNull();
      expect(window.sessionStorage.getItem(key)).toBeNull();
    });
  });

  describe('sweepExpired', () => {
    it('removes expired markers but keeps fresh ones', () => {
      const start = 1_000_000;
      vi.useFakeTimers();
      vi.setSystemTime(start);

      // Marker that will be stale by the time we sweep.
      ViewerTagMarkerStorage.set({ pubky: VIEWER_A, postId: POST_ID, label: 'stale', op: HttpMethod.PUT });

      // Jump close to (but not past) TTL, then write a "fresh" marker.
      vi.setSystemTime(start + MARKER_TTL_MS - 1000);
      ViewerTagMarkerStorage.set({ pubky: VIEWER_A, postId: POST_ID, label: 'fresh', op: HttpMethod.PUT });

      // Jump past the first marker's expiry but not the second's.
      vi.setSystemTime(start + MARKER_TTL_MS + 1);

      ViewerTagMarkerStorage.sweepExpired();

      expect(window.sessionStorage.getItem(buildKey(VIEWER_A, POST_ID, 'stale'))).toBeNull();
      expect(window.sessionStorage.getItem(buildKey(VIEWER_A, POST_ID, 'fresh'))).not.toBeNull();
    });

    it('removes corrupted entries under our prefix', () => {
      const key = buildKey(VIEWER_A, POST_ID, 'corrupt');
      window.sessionStorage.setItem(key, '{bad');

      ViewerTagMarkerStorage.sweepExpired();

      expect(window.sessionStorage.getItem(key)).toBeNull();
    });

    it('removes invalid-shape entries even if they have a future expiresAt', () => {
      // Future-dated but malformed (unknown op) — without shape validation this
      // would linger in storage forever.
      const key = buildKey(VIEWER_A, POST_ID, 'invalid');
      window.sessionStorage.setItem(
        key,
        JSON.stringify({ op: 'GARBAGE', ts: Date.now(), expiresAt: Date.now() + 60_000 }),
      );

      ViewerTagMarkerStorage.sweepExpired();

      expect(window.sessionStorage.getItem(key)).toBeNull();
    });

    it('does not touch sessionStorage keys outside our prefix', () => {
      window.sessionStorage.setItem('unrelated:key', 'data');

      ViewerTagMarkerStorage.sweepExpired();

      expect(window.sessionStorage.getItem('unrelated:key')).toBe('data');
    });
  });

  describe('clearForUser', () => {
    it('removes only markers belonging to the given user', () => {
      ViewerTagMarkerStorage.set({ pubky: VIEWER_A, postId: POST_ID, label: 'a', op: HttpMethod.PUT });
      ViewerTagMarkerStorage.set({ pubky: VIEWER_B, postId: POST_ID, label: 'a', op: HttpMethod.PUT });

      ViewerTagMarkerStorage.clearForUser(VIEWER_A);

      expect(ViewerTagMarkerStorage.get({ pubky: VIEWER_A, postId: POST_ID, label: 'a' })).toBeNull();
      // Other user's marker is preserved.
      expect(ViewerTagMarkerStorage.get({ pubky: VIEWER_B, postId: POST_ID, label: 'a' })?.op).toBe(HttpMethod.PUT);
    });

    it('does not touch sessionStorage keys outside our prefix', () => {
      window.sessionStorage.setItem('unrelated:key', 'data');

      ViewerTagMarkerStorage.clearForUser(VIEWER_A);

      expect(window.sessionStorage.getItem('unrelated:key')).toBe('data');
    });
  });
});
