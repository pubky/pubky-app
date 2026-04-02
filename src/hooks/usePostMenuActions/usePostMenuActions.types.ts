import type { LucideIcon } from 'lucide-react';
import type { POST_MENU_ACTION_IDS, POST_MENU_ACTION_VARIANTS } from './usePostMenuActions.constants';

export type PostMenuActionId = (typeof POST_MENU_ACTION_IDS)[keyof typeof POST_MENU_ACTION_IDS];
export type PostMenuActionVariant = (typeof POST_MENU_ACTION_VARIANTS)[keyof typeof POST_MENU_ACTION_VARIANTS];

export interface PostMenuActionItem {
  id: PostMenuActionId;
  label: string;
  icon: LucideIcon;
  onClick: () => void | Promise<void>;
  variant: PostMenuActionVariant;
  disabled?: boolean;
}

export interface UsePostMenuActionsOptions {
  /** Callback when report action is clicked - opens the report dialog */
  onReportClick: () => void;
  /** Callback when edit action is clicked - opens the edit dialog */
  onEditClick: () => void;
  /** Callback when delete action is clicked - opens the confirm delete dialog */
  onDeleteClick: () => void;
  /** Whether a delete operation is in progress (disables the delete menu item) */
  isDeleting?: boolean;
}

export interface UsePostMenuActionsResult {
  menuItems: PostMenuActionItem[];
  isLoading: boolean;
}
