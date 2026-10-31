import { Bell, CircleHelp, MegaphoneOff, Shield, SunMoon, UserRound } from 'lucide-react';
import { SETTINGS_ROUTES } from '@/app/routes';
import type { SettingsMenuItem } from '../SettingsMenu/SettingsMenu.types';

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
    icon: SunMoon,
    id: 'appearance',
    label: 'Appearance',
    path: SETTINGS_ROUTES.APPEARANCE,
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
