export type TagsLayout = 'inline' | 'side';

export type PostMainSurface = 'default' | 'collection';

export interface PostMainProps {
  postId: string;
  className?: string;
  isReply?: boolean;
  isLastReply?: boolean;
  pinActionsToBottom?: boolean;
  isNavigable?: boolean;
}
