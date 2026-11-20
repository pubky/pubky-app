import type { Pubky } from '@/models/models.types';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';

export interface WhoTaggedExpandedListProps {
  /** Tagger IDs to render */
  taggerIds: Pubky[];
  /** Fallback tagger data when user details are missing */
  fallbackTaggers?: TaggerWithAvatar[];
  /** Initial loading preserves available previews; otherwise shows a skeleton. */
  isLoadingTaggers?: boolean;
  /** Loading another page or refreshing existing rows. */
  isLoadingMore?: boolean;
  /** Whether more taggers can be loaded by scrolling to the bottom */
  hasMore?: boolean;
  /** Pauses automatic loading and offers a manual retry. */
  hasError?: boolean;
  /** Called when the bottom sentinel scrolls into view */
  onLoadMore?: () => void;
  /**
   * A second group, after a thin rule: e.g. people who put the tag only on the same thing's other
   * links (an external resource's page). The groups are named for screen readers by `groupNames`.
   */
  secondaryTaggerIds?: Pubky[];
  /** The two groups' names, read by screen readers only (`[first, second]`). */
  groupNames?: readonly [string, string];
  /** Shown in a tagger's row after the name, e.g. the icons of the services they put the tag on. */
  renderTaggerAside?: (taggerId: Pubky) => React.ReactNode;
  /** People counted but not listed, with no way to load them: a muted "+N" at the end. */
  moreCount?: number;
  /** Test ID */
  'data-testid'?: string;
}
