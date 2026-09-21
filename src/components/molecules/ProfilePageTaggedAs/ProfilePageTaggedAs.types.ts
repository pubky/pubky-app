import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';

/**
 * Layout variant of the tagged section.
 *
 * - `sidebar`: desktop profile sidebar widget (current behaviour, unchanged).
 * - `mobile`: mobile profile tab card (count heading, inline add-tag input,
 *   tagger avatars and a "See All" action).
 */
export type ProfilePageTaggedAsVariant = 'sidebar' | 'mobile';

export interface ProfilePageTaggedAsProps {
  tags: TagWithAvatars[];
  isLoading?: boolean;
  onTagClick: (tag: TagWithAvatars) => void | Promise<void>;
  /** The pubky of the profile being viewed (undefined for own profile) */
  pubky?: string;
  /** Layout variant. Defaults to `sidebar` so the desktop widget is untouched. */
  variant?: ProfilePageTaggedAsVariant;
  /** Total number of unique tags for the profile. Only rendered in the `mobile` variant. */
  count?: number;
  /** Adds a tag to the profile. Required for the `mobile` variant's inline input to render. */
  onTagAdd?: (tag: string) => void | Promise<unknown>;
  /**
   * Full tag list used by the `mobile` input for duplicate checks and suggestions.
   * Defaults to `tags` (the loaded preview slice) when omitted.
   */
  allTags?: TagWithAvatars[];
}