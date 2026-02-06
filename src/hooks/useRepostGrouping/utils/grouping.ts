import type { Pubky, PostDetailsModelSchema, PostRelationshipsModelSchema } from '@/core';
import { buildCompositeIdFromPubkyUri, parseCompositeId, CompositeIdDomain } from '@/core';
import { TIMELINE_ITEM_TYPE } from '@/organisms/Timeline/Posts/Posts.constants';
import type { TimelineItem, SinglePostItem, RepostGroup } from '@/organisms/Timeline/Posts/Posts.types';
import type { PostData, PlainRepostsResult } from './grouping.types';

/**
 * Plain repost = has repost relation, but no content and no attachments
 */
function isPlainRepost(
  details: PostDetailsModelSchema | undefined,
  relationships: PostRelationshipsModelSchema | undefined,
): boolean {
  return !!relationships?.reposted && !details?.content?.trim() && !details?.attachments?.length;
}

function extractOriginalPostId(relationships: PostRelationshipsModelSchema | undefined): string | null {
  if (!relationships?.reposted) return null;
  return buildCompositeIdFromPubkyUri({
    uri: relationships.reposted,
    domain: CompositeIdDomain.POSTS,
  });
}

function extractReposterPubky(postId: string): Pubky {
  try {
    return parseCompositeId(postId).pubky;
  } catch {
    return '';
  }
}

function findEarliestTimestamp(posts: PostData[]): number {
  let earliest = Infinity;
  for (const post of posts) {
    const timestamp = post.details?.indexed_at;
    if (timestamp && timestamp < earliest) {
      earliest = timestamp;
    }
  }
  return earliest === Infinity ? Date.now() : earliest;
}

function deduplicateReposters(posts: PostData[]): Map<Pubky, PostData> {
  const unique = new Map<Pubky, PostData>();
  for (const post of posts) {
    if (post.reposterPubky && !unique.has(post.reposterPubky)) {
      unique.set(post.reposterPubky, post);
    }
  }
  return unique;
}

function collectPostData(
  postId: string,
  detailsMap: Map<string, PostDetailsModelSchema | undefined>,
  relationshipsMap: Map<string, PostRelationshipsModelSchema | undefined>,
): PostData {
  const details = detailsMap.get(postId);
  const relationships = relationshipsMap.get(postId);

  return {
    postId,
    details,
    relationships,
    originalPostId: extractOriginalPostId(relationships),
    reposterPubky: extractReposterPubky(postId),
  };
}

function collectAllPostsData(
  postIds: string[],
  detailsMap: Map<string, PostDetailsModelSchema | undefined>,
  relationshipsMap: Map<string, PostRelationshipsModelSchema | undefined>,
): PostData[] {
  return postIds.map((id) => collectPostData(id, detailsMap, relationshipsMap));
}

function identifyPlainReposts(postsData: PostData[]): PlainRepostsResult {
  const byOriginalPost = new Map<string, PostData[]>();
  const postIds = new Set<string>();

  for (const data of postsData) {
    if (!isPlainRepost(data.details, data.relationships) || !data.originalPostId) {
      continue;
    }

    postIds.add(data.postId);

    const existing = byOriginalPost.get(data.originalPostId);
    if (existing) {
      existing.push(data);
    } else {
      byOriginalPost.set(data.originalPostId, [data]);
    }
  }

  return { byOriginalPost, postIds };
}

function createSingleItem(postId: string): SinglePostItem {
  return { type: TIMELINE_ITEM_TYPE.SINGLE, postId };
}

function createRepostGroup(
  originalPostId: string,
  uniqueReposters: Map<Pubky, PostData>,
  allReposts: PostData[],
  currentUserPubky: Pubky | null | undefined,
): RepostGroup {
  const reposterIds: Pubky[] = [];
  const repostPostIds: string[] = [];
  let currentUserRepostId: string | undefined;

  for (const [pubky, post] of uniqueReposters) {
    reposterIds.push(pubky);
    repostPostIds.push(post.postId);
    if (currentUserPubky === pubky) {
      currentUserRepostId = post.postId;
    }
  }

  return {
    type: TIMELINE_ITEM_TYPE.REPOST_GROUP,
    originalPostId,
    repostPostIds,
    reposterIds,
    earliestTimestamp: findEarliestTimestamp(allReposts),
    includesCurrentUser: currentUserRepostId !== undefined,
    currentUserRepostId,
  };
}

function tryCreateRepostGroup(
  reposts: PostData[],
  originalPostId: string,
  currentUserPubky: Pubky | null | undefined,
): RepostGroup | null {
  if (reposts.length < 2) return null;

  const uniqueReposters = deduplicateReposters(reposts);
  if (uniqueReposters.size < 2) return null;

  return createRepostGroup(originalPostId, uniqueReposters, reposts, currentUserPubky);
}

function buildTimelineItems(
  postsData: PostData[],
  plainReposts: PlainRepostsResult,
  currentUserPubky: Pubky | null | undefined,
): TimelineItem[] {
  const processedOriginals = new Set<string>();
  const result: TimelineItem[] = [];

  for (const data of postsData) {
    const isPartOfRepostGroup = plainReposts.postIds.has(data.postId) && data.originalPostId;

    if (!isPartOfRepostGroup) {
      result.push(createSingleItem(data.postId));
      continue;
    }

    if (processedOriginals.has(data.originalPostId!)) {
      continue;
    }

    processedOriginals.add(data.originalPostId!);

    const groupedReposts = plainReposts.byOriginalPost.get(data.originalPostId!);
    if (!groupedReposts) {
      result.push(createSingleItem(data.postId));
      continue;
    }

    const group = tryCreateRepostGroup(groupedReposts, data.originalPostId!, currentUserPubky);
    result.push(group ?? createSingleItem(groupedReposts[0].postId));
  }

  return result;
}

/**
 * Groups plain reposts of the same original post into RepostGroup items.
 * Non-grouped items remain as SinglePostItem.
 *
 * A "plain repost" is a repost without content or attachments.
 * Reposts are grouped only when multiple unique users repost the same post.
 */
export function groupPlainReposts(
  postIds: string[],
  detailsMap: Map<string, PostDetailsModelSchema | undefined>,
  relationshipsMap: Map<string, PostRelationshipsModelSchema | undefined>,
  currentUserPubky: Pubky | null | undefined,
): TimelineItem[] {
  if (postIds.length === 0) return [];

  const postsData = collectAllPostsData(postIds, detailsMap, relationshipsMap);
  const plainReposts = identifyPlainReposts(postsData);

  return buildTimelineItems(postsData, plainReposts, currentUserPubky);
}
