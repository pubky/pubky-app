import type { PostMenuActionListItem } from '@/organisms/PostMenuActions/PostMenuActionList/PostMenuActionList';
import type { POST_MENU_ACTION_IDS, POST_MENU_ACTION_VARIANTS } from './usePostMenuActions.constants';

export type PostMenuActionId = (typeof POST_MENU_ACTION_IDS)[keyof typeof POST_MENU_ACTION_IDS];
export type PostMenuActionVariant = (typeof POST_MENU_ACTION_VARIANTS)[keyof typeof POST_MENU_ACTION_VARIANTS];

/** A row of `PostMenuActionList`, narrowed to the post's own ids and variants. */
export interface PostMenuActionItem extends PostMenuActionListItem {
  id: PostMenuActionId;
  variant: PostMenuActionVariant;
}

export interface UsePostMenuActionsOptions {
  active?: boolean;
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
