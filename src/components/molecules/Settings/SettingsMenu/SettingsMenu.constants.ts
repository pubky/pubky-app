import { Bell, CircleHelp, MegaphoneOff, Shield, UserRound } from 'lucide-react';
import { SETTINGS_ROUTES } from '@/app/routes';
import type { SettingsMenuItem } from './SettingsMenu.types';

export const SETTINGS_MENU_ITEMS: SettingsMenuItem[] = [
  {
    icon: UserRound,
    labelKey: 'account',
    path: SETTINGS_ROUTES.ACCOUNT,
  },
  {
    icon: Bell,
    labelKey: 'notifications',
    path: SETTINGS_ROUTES.NOTIFICATIONS,
  },
  {
    icon: Shield,
    labelKey: 'privacySafety',
    path: SETTINGS_ROUTES.PRIVACY_SAFETY,
  },
  {
    icon: MegaphoneOff,
    labelKey: 'mutedUsers',
    path: SETTINGS_ROUTES.MUTED_USERS,
  },
  {
    icon: CircleHelp,
    labelKey: 'help',
    path: SETTINGS_ROUTES.HELP,
  },
];
