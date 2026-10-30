import { PWA_INSTALL_REMINDER_DELAYS_MS, PWA_INSTALL_STORAGE_ID } from '@/config/pwa';
import { createFeatureReminder } from '@/libs/featureDiscovery/featureReminder';

/**
 * Snooze state for the "Install Pubky" banner. Installing (or confirming the iOS steps)
 * retires it for good; "Later" follows `PWA_INSTALL_REMINDER_DELAYS_MS`.
 */
export const installReminder = createFeatureReminder(PWA_INSTALL_STORAGE_ID, PWA_INSTALL_REMINDER_DELAYS_MS);
