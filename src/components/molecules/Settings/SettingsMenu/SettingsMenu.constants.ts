import * as Libs from '@/libs';
import { SETTINGS_ROUTES } from '@/app';
import type { SettingsMenuItem } from './SettingsMenu.types';

export const SETTINGS_MENU_ITEMS: SettingsMenuItem[] = [
  { icon: Libs.UserRound, labelKey: 'account', path: SETTINGS_ROUTES.ACCOUNT },
  { icon: Libs.Bell, labelKey: 'notifications', path: SETTINGS_ROUTES.NOTIFICATIONS },
  { icon: Libs.Shield, labelKey: 'privacySafety', path: SETTINGS_ROUTES.PRIVACY_SAFETY },
  { icon: Libs.MegaphoneOff, labelKey: 'mutedUsers', path: SETTINGS_ROUTES.MUTED_USERS },
  { icon: Libs.Globe, labelKey: 'language', path: SETTINGS_ROUTES.LANGUAGE },
  { icon: Libs.CircleHelp, labelKey: 'help', path: SETTINGS_ROUTES.HELP },
];
