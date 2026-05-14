import { FileController } from '@/controllers/file/file';
import type { Pubky } from '@/models/models.types';
import type { NexusTag } from '@/services/nexus/nexus.types';
import type { TagWithAvatars } from './TaggedItem.types';

/**
 * Transform NexusTag to TagWithAvatars by resolving avatar URLs
 */
export function transformTagWithAvatars(tag: NexusTag): TagWithAvatars {
  return {
    label: tag.label ?? '',
    taggers_count: tag.taggers_count ?? 0,
    relationship: tag.relationship ?? false,
    taggers: (tag.taggers ?? []).map((taggerId) => ({
      id: taggerId,
      avatarUrl: FileController.getAvatarUrl(taggerId as Pubky),
    })),
  };
}

/**
 * Transform an array of NexusTags to TagWithAvatars, adding viewer relationship.
 * Filters out invalid tags (missing label) and resolves avatar URLs.
 *
 * Uses the existing `relationship` field from Nexus if available,
 * otherwise falls back to checking if viewerId is in the taggers array.
 * This is important because the taggers array may be truncated (e.g., only first 5 taggers)
 * but the relationship field from Nexus is always accurate.
 *
 * @param tags - Array of NexusTags to transform
 * @param viewerId - Optional viewer ID to determine relationship status
 * @returns Array of TagWithAvatars with relationship and avatar data
 */
export function transformTagsForViewer(tags: NexusTag[], viewerId?: string | null): TagWithAvatars[] {
  return tags
    .filter((tag) => tag.label)
    .map((tag) => {
      // Use existing relationship from Nexus if available, otherwise check taggers array
      const hasRelationship = tag.relationship ?? (viewerId ? (tag.taggers?.includes(viewerId) ?? false) : false);

      const tagWithRelationship = {
        ...tag,
        relationship: hasRelationship,
      };
      return transformTagWithAvatars(tagWithRelationship);
    });
}
