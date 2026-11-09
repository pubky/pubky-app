/**
 * Parameters for timestamp-based notification pagination in controller.
 *
 * @property olderThan - Unix timestamp to get notifications older than.
 *                       Defaults to Infinity for initial load (most recent notifications).
 *                       Use the timestamp of the last notification for pagination.
 * @property limit - Optional maximum number of notifications to return.
 *                   Defaults to NEXUS_NOTIFICATIONS_LIMIT.
 */
export type TGetNotificationsParams = {
  olderThan?: number;
  limit?: number;
};
