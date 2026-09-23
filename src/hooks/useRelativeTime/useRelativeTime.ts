'use client';
const DAYS_PER_WEEK = 7;
const WEEKS_PER_MONTH = 4;
const DAYS_PER_YEAR = 365;
const MAX_MONTHS = 11;

/**
 * Hook to format relative time.
 *
 * Uses compact labels for every duration (e.g., "2h", "3w", "6M", "1Y").
 *
 * @returns Object with formatRelativeTime function
 *
 * @example
 * const { formatRelativeTime } = useRelativeTime();
 * const timeAgo = formatRelativeTime(new Date(post.indexed_at));
 * // Returns: "4s", "5m", "2h", "3d", "5w", "6M", "1Y", "2Y", etc.
 */
export function useRelativeTime() {
  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
    const diffMins = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / DAYS_PER_WEEK);
    const diffMonths = Math.floor(diffWeeks / WEEKS_PER_MONTH);

    if (diffSeconds < 60) return `${diffSeconds}s`;
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    if (diffWeeks < 8) return `${diffWeeks}w`;
    // Keep years at 365 days and cap the four-week month approximation below a year.
    if (diffDays < DAYS_PER_YEAR) {
      return `${Math.min(diffMonths, MAX_MONTHS)}M`;
    }

    const diffYears = Math.floor(diffDays / DAYS_PER_YEAR);
    return `${diffYears}Y`;
  }

  return { formatRelativeTime };
}
