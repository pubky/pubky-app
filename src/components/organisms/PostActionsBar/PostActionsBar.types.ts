import type React from 'react';

export interface PostActionsBarProps {
  postId: string;
  /** Saved membership belongs to the feed entry even when its body displays an original. */
  savePostId?: string;
  onTagClick?: () => void;
  onReplyClick?: () => void;
  onRepostClick?: () => void;
  className?: string;
  variant?: 'default' | 'visual';
}

export interface ActionButtonConfig {
  id: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; fill?: string }>;
  count?: number;
  onClick?: () => void;
  ariaLabel: string;
  className?: string;
  iconProps?: { fill?: string; className?: string };
  disabled?: boolean;
}
