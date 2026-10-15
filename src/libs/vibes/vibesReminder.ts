import { VIBES_ALERT_STORAGE_ID, VIBES_ALERT_WINDOW, VIBES_REMINDER_DELAYS_MS } from '@/config/featureDiscovery';
import { createFeatureReminder, type FeatureReminder } from '@/libs/featureDiscovery/featureReminder';

const reminder = createFeatureReminder(VIBES_ALERT_STORAGE_ID, VIBES_REMINDER_DELAYS_MS);

function isInAlertWindow(): boolean {
  const now = Date.now();
  return now >= VIBES_ALERT_WINDOW.startsAt && now < VIBES_ALERT_WINDOW.endsAt;
}

/**
 * Snooze state for the Pubky Vibes Home alert. It is only due inside `VIBES_ALERT_WINDOW`;
 * opening Vibes from any entry point retires it for good; "Later" follows `VIBES_REMINDER_DELAYS_MS`.
 */
export const vibesReminder: FeatureReminder = {
  ...reminder,
  isDue: (pubky) => isInAlertWindow() && reminder.isDue(pubky),
};
