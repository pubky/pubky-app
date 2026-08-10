import { Bell, CircleHelp, MegaphoneOff, Shield, UserRound } from 'lucide-react';
import { SETTINGS_ROUTES } from '@/app/routes';
import type { SettingsMenuItem } from './SettingsMenu.types';

export const SETTINGS_MENU_ITEMS: SettingsMenuItem[] = [
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
