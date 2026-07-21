export type TagsLayout = 'inline' | 'side' | 'list';

export interface PostMainProps {
  postId: string;
  className?: string;
  isReply?: boolean;
  isLastReply?: boolean;
  pinActionsToBottom?: boolean;
  isNavigable?: boolean;
  showFullContentInListLayout?: boolean;
}
