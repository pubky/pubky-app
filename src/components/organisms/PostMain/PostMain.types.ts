export type TagsLayout = 'inline' | 'side';

export interface PostMainProps {
  postId: string;
  onClick?: () => void;
  className?: string;
  cardDataCy?: string;
  isReply?: boolean;
  isLastReply?: boolean;
  pinActionsToBottom?: boolean;
}
