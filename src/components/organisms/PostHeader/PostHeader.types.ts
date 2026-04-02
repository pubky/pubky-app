export interface PostHeaderProps {
  postId: string;
  isReplyInput?: boolean;
  characterLimit?: {
    count: number;
    max: number;
  };
  showPopover?: boolean;
  size?: 'normal' | 'large';
  timeAgoPlacement?: 'top-right' | 'bottom-left';
}
