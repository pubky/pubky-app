export type TagsLayout = 'inline' | 'side';

export interface PostMainProps {
  postId: string;
  onClick?: () => void;
  className?: string;
  isReply?: boolean;
  isLastReply?: boolean;
  tagsLayout?: TagsLayout;
}
