import { SETTINGS_ROUTES } from '@/app';
import type { SettingsMenuItem } from './SettingsMenu.types';
import { UserRound, Bell, Shield, MegaphoneOff, Globe, CircleHelp } from 'lucide-react';
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
    icon: Globe,
    labelKey: 'language',
    path: SETTINGS_ROUTES.LANGUAGE,
  },
  {
    icon: CircleHelp,
    labelKey: 'help',
    path: SETTINGS_ROUTES.HELP,
  },
];
