import type { TagsLayout } from '../../../organisms/PostMain/PostMain.types';

export interface TimelinePostRepliesProps {
  postId: string;
  onPostClick: (postId: string) => void;
  tagsLayout?: TagsLayout;
}
