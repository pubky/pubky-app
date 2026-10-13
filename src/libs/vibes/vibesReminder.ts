import { VIBES_ALERT_STORAGE_ID, VIBES_REMINDER_DELAYS_MS } from '@/config/featureDiscovery';
import { createFeatureReminder } from '@/libs/featureDiscovery/featureReminder';

/**
 * Snooze state for the Pubky Vibes Home alert. Opening Vibes from any entry point retires it
 * for good; "Later" follows `VIBES_REMINDER_DELAYS_MS`.
 */
export const vibesReminder = createFeatureReminder(VIBES_ALERT_STORAGE_ID, VIBES_REMINDER_DELAYS_MS);
