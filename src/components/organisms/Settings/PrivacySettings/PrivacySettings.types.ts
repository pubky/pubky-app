import type { PrivacyPreferences } from '@/stores/settings/settings.types';

export type PrivacyType = keyof Omit<PrivacyPreferences, 'moderationBot'>;
