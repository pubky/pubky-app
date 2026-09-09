import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';

export interface TaggedSectionProps {
  tags: TagWithAvatars[];
  taggedId: string;
  userName?: string;
  handleTagAdd: (tagString: string) => Promise<{ success: boolean; error?: string }>;
  handleTagToggle: (tag: TagWithAvatars) => Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
}
