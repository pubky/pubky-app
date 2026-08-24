// Consumed by `Settings.vrt.test.tsx`. Privacy stays on product defaults;
// notifications mix on/off so the switches are not a uniform column of trues.
import {
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  type NotificationPreferences,
  type PrivacyPreferences,
} from '@/stores/settings/settings.types';
import { VRT_AUTHOR_PUBKYS } from '../feed/profiles';

export const VRT_SETTINGS_NOTIFICATIONS: NotificationPreferences = {
  ...defaultNotificationPreferences,
  tagPost: false,
  repost: false,
  postDeleted: false,
};

export const VRT_SETTINGS_PRIVACY: PrivacyPreferences = defaultPrivacyPreferences;

/** Muted-users tab — three people so the list and "Unmute all" both show. */
export const VRT_MUTED_PUBKYS = [VRT_AUTHOR_PUBKYS.bran, VRT_AUTHOR_PUBKYS.fynn, VRT_AUTHOR_PUBKYS.hana] as const;
