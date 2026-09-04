import type { TagKind } from '@/application/tag/tag.types';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';

export interface TaggedSectionProps {
  tags: TagWithAvatars[];
  taggedId: string;
  taggedKind: TagKind;
  userName?: string;
  handleTagAdd: (tagString: string) => Promise<{ success: boolean; error?: string }>;
  handleTagToggle: (tag: TagWithAvatars) => Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
}
