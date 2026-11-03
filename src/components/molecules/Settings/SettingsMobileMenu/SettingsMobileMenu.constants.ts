import { Bell, Bot, CircleHelp, MegaphoneOff, Shield, UserRound } from 'lucide-react';
import { SETTINGS_ROUTES } from '@/app/routes';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import type { SettingsMenuItem } from '../SettingsMenu/SettingsMenu.types';

const PUBCHI_MOBILE_ITEM: SettingsMenuItem = {
  icon: Bot,
  id: 'pubchi',
  label: 'Pubchi',
  path: SETTINGS_ROUTES.PUBCHI,
};

export const SETTINGS_MOBILE_ITEMS: SettingsMenuItem[] = [
  {
    icon: UserRound,
    id: 'account',
    label: 'Account',
    path: SETTINGS_ROUTES.ACCOUNT,
  },
  {
    icon: Bell,
    id: 'notifications',
    label: 'Notifications',
    path: SETTINGS_ROUTES.NOTIFICATIONS,
  },
  {
    icon: Shield,
    id: 'privacySafety',
    label: 'Privacy & Safety',
    path: SETTINGS_ROUTES.PRIVACY_SAFETY,
  },
  {
    icon: MegaphoneOff,
    id: 'mutedUsers',
    label: 'Muted Users',
    path: SETTINGS_ROUTES.MUTED_USERS,
  },
  {
    icon: CircleHelp,
    id: 'help',
    label: 'Help',
    path: SETTINGS_ROUTES.HELP,
  },
];

export function getSettingsMobileItems(): SettingsMenuItem[] {
  if (!isPubchiEnabled()) return SETTINGS_MOBILE_ITEMS;
  const helpIndex = SETTINGS_MOBILE_ITEMS.findIndex((item) => item.id === 'help');
  return [...SETTINGS_MOBILE_ITEMS.slice(0, helpIndex), PUBCHI_MOBILE_ITEM, ...SETTINGS_MOBILE_ITEMS.slice(helpIndex)];
}
