import { Logger } from '@/libs/logger/logger';
import { TagKind } from '@/application/tag/tag.types';
import { TagController } from '@/controllers/tag/tag';
import type { Pubky } from '@/models/models.types';
import type { NexusTag } from '@/services/nexus/nexus.types';
/**
 * Adds a user as tagger to a tag (optimistically)
 */
export function addTaggerToTag(tag: NexusTag, userId: string): NexusTag {
  // Avoid duplicates
  if (tag.taggers.includes(userId)) {
    return { ...tag, relationship: true };
  }
  return {
    ...tag,
    taggers: [...tag.taggers, userId],
    taggers_count: tag.taggers_count + 1,
    relationship: true,
  };
}

/**
 * Removes a user as tagger from a tag (optimistically)
 */
export function removeTaggerFromTag(tag: NexusTag, userId: string): NexusTag {
  const newTaggers = tag.taggers.filter((id) => id !== userId);
  return {
    ...tag,
    taggers: newTaggers,
    taggers_count: Math.max(0, tag.taggers_count - 1),
    relationship: false,
  };
}

/**
 * Updates a specific tag in a list
 */
export function updateTagInList(
  tags: NexusTag[],
  targetLabel: string,
  updater: (tag: NexusTag) => NexusTag,
): NexusTag[] {
  return tags.map((tag) => (tag.label === targetLabel ? updater(tag) : tag));
}

/**
 * Checks if a user is a tagger of a specific tag
 */
export function isUserTagger(tags: NexusTag[], label: string, userId: string): boolean {
  const tag = tags.find((t) => t.label === label);
  return tag?.taggers.includes(userId) ?? false;
}

/**
 * Finds a tag by label (case-insensitive)
 */
export function findTagByLabel(tags: NexusTag[], label: string): NexusTag | undefined {
  return tags.find((t) => t.label.toLowerCase() === label.toLowerCase());
}

/**
 * Creates an optimistic new tag
 */
export function createOptimisticTag(label: string, userId: string): NexusTag {
  return {
    label,
    taggers: [userId],
    taggers_count: 1,
    relationship: true,
  };
}

/**
 * Creates tag in backend
 */
export async function createTagInBackend(taggedId: string, label: string, taggerId: string): Promise<void> {
  try {
    await TagController.commitCreate({
      taggedId: taggedId as Pubky,
      label,
      taggerId,
      taggedKind: TagKind.USER,
    });
  } catch (error) {
    Logger.error('[useTagged.utils] Failed to create tag in backend', { taggedId, label, taggerId, error });
    throw error;
  }
}

/**
 * Deletes tag from backend
 */
export async function deleteTagFromBackend(taggedId: string, label: string, taggerId: string): Promise<void> {
  try {
    await TagController.commitDelete({
      taggedId: taggedId as Pubky,
      label,
      taggerId,
      taggedKind: TagKind.USER,
    });
  } catch (error) {
    Logger.error('[useTagged.utils] Failed to delete tag from backend', { taggedId, label, taggerId, error });
    throw error;
  }
}

/**
 * Merges server tags with zero-tagger tags, preserving the order of existing tags.
 * Updates existing tags with server data, keeps zero-tagger tags in their position.
 */
export function mergeTagsPreservingOrder(
  serverTags: NexusTag[],
  currentTags: NexusTag[],
  zeroTaggerTags: NexusTag[],
): NexusTag[] {
  // If no current tags, just return server tags
  if (currentTags.length === 0) {
    return serverTags;
  }

  // Create a map of server tags for quick lookup
  const serverTagsMap = new Map<string, NexusTag>();
  for (const tag of serverTags) {
    serverTagsMap.set(tag.label.toLowerCase(), tag);
  }

  // Create a map of zero-tagger tags
  const zeroTaggerMap = new Map<string, NexusTag>();
  for (const tag of zeroTaggerTags) {
    zeroTaggerMap.set(tag.label.toLowerCase(), tag);
  }

  // Update current tags in place, preserving order
  const result: NexusTag[] = [];
  const seenLabels = new Set<string>();

  // First, go through current tags and update them with server data
  for (const currentTag of currentTags) {
    const key = currentTag.label.toLowerCase();
    seenLabels.add(key);

    const serverTag = serverTagsMap.get(key);
    const zeroTag = zeroTaggerMap.get(key);

    if (serverTag) {
      // Tag exists on server, use server data
      result.push(serverTag);
    } else if (zeroTag) {
      // Tag has 0 taggers, preserve it
      result.push(zeroTag);
    }
    // If neither, the tag was removed completely - don't include it
  }

  // Add any new server tags that weren't in current tags (at the end)
  for (const serverTag of serverTags) {
    const key = serverTag.label.toLowerCase();
    if (!seenLabels.has(key)) {
      result.push(serverTag);
    }
  }

  return result;
}
