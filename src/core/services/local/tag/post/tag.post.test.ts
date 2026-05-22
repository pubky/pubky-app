import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/franky/franky';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostTagsModel } from '@/models/post/tags/postTags';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import { ViewerTagMarkerStorage } from '@/services/local/tag/post/viewerTagMarkerStorage';
import type { TLocalTagParams } from '@/services/local/tag/tag.types';
import type { NexusTag } from '@/services/nexus/nexus.types';

// Test data
const testData = {
  authorPubky: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky,
  taggerPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky,
  anotherTaggerPubky: 'y4euc88xboik1ev3axy9m9ajuedo8gx1mh1n7ms8zoxm5s1b1h9y' as Pubky,
  postId: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy:abc123xyz',
};

// Helper functions
const createTagParams = (label: string): TLocalTagParams => ({
  taggedId: testData.postId,
  label,
  taggerId: testData.taggerPubky,
});

const createRemoveParams = (label: string): TLocalTagParams => ({
  taggedId: testData.postId,
  label,
  taggerId: testData.taggerPubky,
});

const getSavedTags = async () => {
  return await PostTagsModel.table.get(testData.postId);
};

const getSavedCounts = async () => {
  return await PostCountsModel.table.get(testData.postId);
};

const getUserCounts = async (userId: Pubky) => {
  return await UserCountsModel.table.get(userId);
};

const getPostTtl = async () => {
  return await PostTtlModel.findById(testData.postId);
};

const createTagRecord = (label: string, taggers: Pubky[], relationship: boolean) => ({
  label,
  taggers,
  taggers_count: taggers.length,
  relationship,
});

const setupExistingTag = async (label: string, taggers: Pubky[], relationship: boolean) => {
  await PostTagsModel.upsert({
    id: testData.postId,
    tags: [createTagRecord(label, taggers, relationship)],
  });
};

const setupPostCounts = async (tags: number, uniqueTags: number) => {
  await PostCountsModel.upsert({
    id: testData.postId,
    replies: 0,
    tags,
    unique_tags: uniqueTags,
    reposts: 0,
  });
};

const setupUserCounts = async (userId: Pubky, tagged: number = 0) => {
  await UserCountsModel.upsert({
    id: userId,
    tagged,
    tags: 0,
    unique_tags: 0,
    posts: 0,
    replies: 0,
    following: 0,
    followers: 0,
    friends: 0,
    bookmarks: 0,
  });
};

// Build a Nexus tag payload. Counts default to taggers.length, relationship to false.
const nexusTag = (
  label: string,
  taggers: Pubky[],
  options: { count?: number; relationship?: boolean } = {},
): NexusTag => ({
  label,
  taggers,
  taggers_count: options.count ?? taggers.length,
  relationship: options.relationship ?? false,
});

describe('LocalTagService', () => {
  beforeEach(async () => {
    await db.initialize();
    await db.transaction(
      'rw',
      [PostTagsModel.table, PostCountsModel.table, UserCountsModel.table, PostTtlModel.table],
      async () => {
        await PostTagsModel.table.clear();
        await PostCountsModel.table.clear();
        await UserCountsModel.table.clear();
        await PostTtlModel.table.clear();
      },
    );
    // Clear viewer-mutation markers so prior tests don't bleed across describes.
    window.sessionStorage.clear();
  });

  describe('create', () => {
    it('should create a new tag to a post', async () => {
      await LocalPostTagService.create(createTagParams('javascript'));

      const savedTags = await getSavedTags();
      expect(savedTags).toBeTruthy();
      expect(savedTags!.tags).toHaveLength(1);
      expect(savedTags!.tags[0].label).toBe('javascript');
      expect(savedTags!.tags[0].taggers_count).toBe(1);
      expect(savedTags!.tags[0].relationship).toBe(true);
    });

    it('should create tagger to existing tag', async () => {
      await LocalPostTagService.create(createTagParams('javascript'));
      await setupExistingTag('javascript', [testData.taggerPubky], false);

      await LocalPostTagService.create({
        taggedId: testData.postId,
        label: 'javascript',
        taggerId: testData.anotherTaggerPubky,
      });

      const savedTags = await getSavedTags();
      expect(savedTags!.tags[0].taggers_count).toBe(2);
      expect(savedTags!.tags[0].relationship).toBe(true);
    });

    it('should ignore if user already created tag post with this label', async () => {
      await setupExistingTag('javascript', [testData.taggerPubky], true);

      await LocalPostTagService.create(createTagParams('javascript'));

      const savedTags = await getSavedTags();
      expect(savedTags!.tags[0].taggers_count).toBe(1); // Should remain unchanged
    });

    it('should update post counts when creating tag', async () => {
      await setupPostCounts(0, 0);
      await LocalPostTagService.create(createTagParams('javascript'));

      const savedCounts = await getSavedCounts();
      expect(savedCounts!.tags).toBe(1);
      expect(savedCounts!.unique_tags).toBe(1);
    });

    it('should increment user tagged count when creating tag', async () => {
      await setupUserCounts(testData.taggerPubky, 0);
      await LocalPostTagService.create(createTagParams('javascript'));

      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(userCounts!.tagged).toBe(1);
    });

    it('should increment user tagged count from existing value when creating tag', async () => {
      await setupUserCounts(testData.taggerPubky, 5);
      await LocalPostTagService.create(createTagParams('javascript'));

      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(userCounts!.tagged).toBe(6);
    });

    it('should create multiple different tags to a post', async () => {
      await LocalPostTagService.create(createTagParams('javascript'));
      await LocalPostTagService.create(createTagParams('react'));

      const savedTags = await getSavedTags();
      expect(savedTags!.tags).toHaveLength(2);
      expect(savedTags!.tags.map((t) => t.label)).toContain('javascript');
      expect(savedTags!.tags.map((t) => t.label)).toContain('react');
    });

    it('should not update counts when user already tagged with same label', async () => {
      await setupExistingTag('javascript', [testData.taggerPubky], true);
      await setupPostCounts(1, 1);
      await setupUserCounts(testData.taggerPubky, 1);

      await LocalPostTagService.create(createTagParams('javascript'));

      const savedCounts = await getSavedCounts();
      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(savedCounts!.tags).toBe(1); // Should remain unchanged
      expect(savedCounts!.unique_tags).toBe(1); // Should remain unchanged
      expect(userCounts!.tagged).toBe(1); // Should remain unchanged
    });

    it('should touch post TTL when creating a tag', async () => {
      const beforeTimestamp = Date.now();
      await LocalPostTagService.create(createTagParams('javascript'));
      const afterTimestamp = Date.now();

      const postTtl = await getPostTtl();
      expect(postTtl).toBeTruthy();
      expect(postTtl!.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(postTtl!.lastUpdatedAt).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should write a PUT marker so mergeTags can protect this change from stale Nexus', async () => {
      await LocalPostTagService.create(createTagParams('javascript'));

      const marker = ViewerTagMarkerStorage.get({
        pubky: testData.taggerPubky,
        postId: testData.postId,
        label: 'javascript',
      });
      expect(marker?.op).toBe(HttpMethod.PUT);
    });

    it('should not write a marker when create is a no-op (idempotent)', async () => {
      // Pre-condition: sessionStorage is empty (cleared by beforeEach), so there
      // is no marker for 'javascript'.
      // Set up IndexedDB so the viewer already has this tag — make the create
      // call a no-op. (`setupExistingTag` only touches IndexedDB, not sessionStorage.)
      await setupExistingTag('javascript', [testData.taggerPubky], true);

      // No-op create: addTagger returns null, the transaction reports `mutated=false`,
      // and the marker-write branch (`if (mutated)`) is skipped entirely.
      await LocalPostTagService.create(createTagParams('javascript'));

      // Therefore no marker was ever written — null here means "absent", not "deleted".
      const marker = ViewerTagMarkerStorage.get({
        pubky: testData.taggerPubky,
        postId: testData.postId,
        label: 'javascript',
      });
      expect(marker).toBeNull();
    });
  });

  describe('remove', () => {
    beforeEach(async () => {
      await setupExistingTag('javascript', [testData.taggerPubky], true);
      await setupPostCounts(1, 1);
    });

    it('should delete tag from post', async () => {
      await LocalPostTagService.delete(createRemoveParams('javascript'));

      const savedTags = await getSavedTags();
      expect(savedTags!.tags).toHaveLength(0);
    });

    it('should update post counts when deleting tag', async () => {
      await LocalPostTagService.delete(createRemoveParams('javascript'));

      const savedCounts = await getSavedCounts();
      expect(savedCounts!.tags).toBe(0);
      expect(savedCounts!.unique_tags).toBe(0);
    });

    it('should decrement user tagged count when deleting tag', async () => {
      await setupUserCounts(testData.taggerPubky, 1);
      await LocalPostTagService.delete(createRemoveParams('javascript'));

      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(userCounts!.tagged).toBe(0);
    });

    it('should decrement user tagged count from existing value when deleting tag', async () => {
      await setupUserCounts(testData.taggerPubky, 10);
      await LocalPostTagService.delete(createRemoveParams('javascript'));

      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(userCounts!.tagged).toBe(9);
    });

    it('should return false if post has no tags when deleting tag (idempotent)', async () => {
      await PostTagsModel.table.clear();

      const result = await LocalPostTagService.delete(createRemoveParams('javascript'));
      expect(result).toBe(false);
    });

    it('should return false if user has not tagged with this label when deleting (idempotent)', async () => {
      await setupExistingTag('javascript', [testData.taggerPubky], false);

      // Different user trying to delete - should return false
      const result = await LocalPostTagService.delete(createRemoveParams('javascript'));
      expect(result).toBe(false);
    });

    it('should delete only the tagger but keep tag if other taggers exist', async () => {
      await setupExistingTag('javascript', [testData.taggerPubky, testData.anotherTaggerPubky], true);

      await LocalPostTagService.delete(createRemoveParams('javascript'));

      const savedTags = await getSavedTags();
      expect(savedTags!.tags).toHaveLength(1);
      expect(savedTags!.tags[0].taggers_count).toBe(1);
      expect(savedTags!.tags[0].relationship).toBe(false);
      expect(savedTags!.tags[0].taggers).toContain(testData.anotherTaggerPubky);
      expect(savedTags!.tags[0].taggers).not.toContain(testData.taggerPubky);
    });

    it('should touch post TTL when deleting a tag', async () => {
      const beforeTimestamp = Date.now();
      await LocalPostTagService.delete(createRemoveParams('javascript'));
      const afterTimestamp = Date.now();

      const postTtl = await getPostTtl();
      expect(postTtl).toBeTruthy();
      expect(postTtl!.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(postTtl!.lastUpdatedAt).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should write a DELETE marker so mergeTags can protect this change from stale Nexus', async () => {
      await LocalPostTagService.delete(createRemoveParams('javascript'));

      const marker = ViewerTagMarkerStorage.get({
        pubky: testData.taggerPubky,
        postId: testData.postId,
        label: 'javascript',
      });
      expect(marker?.op).toBe(HttpMethod.DELETE);
    });
  });

  describe('mergeTags', () => {
    it('replaces taggers_count with the Nexus value (Math.max regression check)', async () => {
      // Pretend local IndexedDB has an outdated count of 5 for this tag.
      // The old code did Math.max(local, nexus) — it always picked the bigger
      // number, so a wrong-too-high count like this would never come back down.
      // The new code must replace local with Nexus's value.
      await PostTagsModel.upsert({
        id: testData.postId,
        tags: [{ label: 'a', taggers: [testData.anotherTaggerPubky], taggers_count: 5, relationship: false }],
      });

      // Simulate Nexus returning the same tag with `count: 2` (the real value).
      // `nexusTag(...)` builds a Nexus response payload — `{ count: 2 }` is
      // what Nexus reports for `taggers_count`.
      await LocalPostTagService.mergeTags({
        postId: testData.postId,
        tags: [nexusTag('a', [testData.anotherTaggerPubky], { count: 2 })],
        viewerId: testData.taggerPubky,
      });

      // After merge, local should be 2 (not 5).
      const saved = await getSavedTags();
      expect(saved!.tags[0].taggers_count).toBe(2);
    });

    it('keeps cached other-user taggers that fall outside the Nexus top-N sample', async () => {
      // Nexus only returns top-N taggers per label, so a flat replace would drop
      // taggers we have cached but Nexus didn't include in this response.
      await PostTagsModel.upsert({
        id: testData.postId,
        tags: [
          {
            label: 'a',
            taggers: [testData.anotherTaggerPubky, 'extra-tagger' as Pubky],
            taggers_count: 2,
            relationship: false,
          },
        ],
      });

      await LocalPostTagService.mergeTags({
        postId: testData.postId,
        tags: [nexusTag('a', [testData.anotherTaggerPubky], { count: 2 })],
        viewerId: testData.taggerPubky,
      });

      const saved = await getSavedTags();
      expect(saved!.tags[0].taggers).toContain(testData.anotherTaggerPubky);
      expect(saved!.tags[0].taggers).toContain('extra-tagger');
    });

    it('leaves labels missing from the Nexus response alone (pagination safety)', async () => {
      // Two labels in IndexedDB; Nexus only returned one (e.g., the other is on a
      // later page). The unseen label must be preserved.
      await PostTagsModel.upsert({
        id: testData.postId,
        tags: [
          { label: 'a', taggers: [testData.anotherTaggerPubky], taggers_count: 1, relationship: false },
          { label: 'b', taggers: [testData.anotherTaggerPubky], taggers_count: 1, relationship: false },
        ],
      });

      await LocalPostTagService.mergeTags({
        postId: testData.postId,
        tags: [nexusTag('a', [testData.anotherTaggerPubky], { count: 1 })],
        viewerId: testData.taggerPubky,
      });

      const saved = await getSavedTags();
      const labels = saved!.tags.map((t) => t.label);
      expect(labels).toContain('a');
      expect(labels).toContain('b');
    });

    describe('viewer marker protection', () => {
      it('keeps viewer out when DELETE marker conflicts with stale Nexus (viewer still listed)', async () => {
        // Viewer just removed themselves locally — Nexus hasn't reindexed yet.
        ViewerTagMarkerStorage.set({
          pubky: testData.taggerPubky,
          postId: testData.postId,
          label: 'a',
          op: HttpMethod.DELETE,
        });

        await LocalPostTagService.mergeTags({
          postId: testData.postId,
          tags: [nexusTag('a', [testData.taggerPubky], { count: 1, relationship: true })],
          viewerId: testData.taggerPubky,
        });

        const saved = await getSavedTags();
        const tag = saved!.tags[0];
        // Marker wins for viewer fields. Nexus's count was 1 because it still
        // counted the viewer; with the viewer taken out, the final count is 0.
        expect(tag.taggers).not.toContain(testData.taggerPubky);
        expect(tag.relationship).toBe(false);
        expect(tag.taggers_count).toBe(0);
      });

      it('keeps viewer in when PUT marker conflicts with stale Nexus (viewer not listed)', async () => {
        // Viewer just added themselves locally — Nexus hasn't reindexed yet.
        ViewerTagMarkerStorage.set({
          pubky: testData.taggerPubky,
          postId: testData.postId,
          label: 'a',
          op: HttpMethod.PUT,
        });

        await LocalPostTagService.mergeTags({
          postId: testData.postId,
          tags: [nexusTag('a', [testData.anotherTaggerPubky], { count: 1, relationship: false })],
          viewerId: testData.taggerPubky,
        });

        const saved = await getSavedTags();
        const tag = saved!.tags[0];
        // Marker wins. Nexus's count was 1 because it didn't know the viewer
        // tagged yet; with the viewer added in, the final count is 2.
        expect(tag.taggers).toContain(testData.taggerPubky);
        expect(tag.relationship).toBe(true);
        expect(tag.taggers_count).toBe(2);
      });

      it('trusts Nexus when no marker is present', async () => {
        await LocalPostTagService.mergeTags({
          postId: testData.postId,
          tags: [nexusTag('a', [testData.taggerPubky], { count: 1, relationship: true })],
          viewerId: testData.taggerPubky,
        });

        const saved = await getSavedTags();
        expect(saved!.tags[0].relationship).toBe(true);
        expect(saved!.tags[0].taggers_count).toBe(1);
      });

      it('skips marker lookup when viewerId is null (unauthenticated viewer)', async () => {
        // Even if a marker exists for a known user, an unauthenticated merge
        // ignores it and applies Nexus values as-is.
        ViewerTagMarkerStorage.set({
          pubky: testData.taggerPubky,
          postId: testData.postId,
          label: 'a',
          op: HttpMethod.DELETE,
        });

        await LocalPostTagService.mergeTags({
          postId: testData.postId,
          tags: [nexusTag('a', [testData.taggerPubky], { count: 1, relationship: true })],
          // `viewerId: null` is what the caller passes when no user is logged in.
          // mergeTags must not look up any marker in this case.
          viewerId: null,
        });

        const saved = await getSavedTags();
        expect(saved!.tags[0].taggers_count).toBe(1);
        expect(saved!.tags[0].relationship).toBe(true);
      });
    });

    it('auto-corrects a previously drifted entry on the next merge', async () => {
      // Pretend a user's IndexedDB is in a bad state left over from the old code:
      // it still shows the viewer as a tagger with count = 1, even though the
      // tag should have been gone by now.
      await PostTagsModel.upsert({
        id: testData.postId,
        tags: [{ label: 'a', taggers: [testData.taggerPubky], taggers_count: 1, relationship: true }],
      });

      // Important: no marker is set here (and beforeEach cleared sessionStorage).
      // Without an active marker, mergeTags trusts Nexus directly — that's how
      // the stale local state gets overwritten with Nexus's correct values below.
      await LocalPostTagService.mergeTags({
        postId: testData.postId,
        // Nexus has caught up: the tag now has no taggers and the viewer is out.
        tags: [nexusTag('a', [], { count: 0, relationship: false })],
        viewerId: testData.taggerPubky,
      });

      const saved = await getSavedTags();
      const tag = saved!.tags[0];
      expect(tag.taggers).toHaveLength(0);
      expect(tag.taggers_count).toBe(0);
      expect(tag.relationship).toBe(false);
    });

    it('triggers ViewerTagMarkerStorage.sweepExpired so stale markers do not accumulate', async () => {
      // Storage-internal cleanup behavior is verified in viewerTagMarkerStorage.test.ts.
      // Here we only assert that mergeTags wires the sweep call into its flow.
      const sweepSpy = vi.spyOn(ViewerTagMarkerStorage, 'sweepExpired');

      await LocalPostTagService.mergeTags({
        postId: testData.postId,
        tags: [nexusTag('other', [testData.anotherTaggerPubky], { count: 1 })],
        viewerId: testData.taggerPubky,
      });

      expect(sweepSpy).toHaveBeenCalled();
      sweepSpy.mockRestore();
    });
  });
});
