import { Bell, CircleHelp, Lock, MegaphoneOff, Shield, SunMoon, UserRound } from 'lucide-react';
import { SETTINGS_ROUTES } from '@/app/routes';
import { isLocksConfigured } from '@/config/network';
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
    icon: Lock,
    id: 'locks',
    label: 'Locks',
    path: SETTINGS_ROUTES.LOCKS,
    requiresLocks: true,
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

/** The Locks item shows only where the deployment configures Locks. */
export const isSettingsMenuItemShown = (item: SettingsMenuItem): boolean => !item.requiresLocks || isLocksConfigured();
