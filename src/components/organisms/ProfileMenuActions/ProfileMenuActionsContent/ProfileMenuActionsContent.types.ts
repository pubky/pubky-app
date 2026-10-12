import type { MENU_VARIANT } from '@/config/ui';

export interface ProfileMenuActionsContentProps {
  active?: boolean;
  userId: string;
  variant: (typeof MENU_VARIANT)[keyof typeof MENU_VARIANT];
  onActionComplete: () => void;
}
