'use client';

import { useFormatter, useTranslations } from 'next-intl';

/**
 * Hook to format relative time with localization support.
 *
 * Uses next-intl's useFormatter for proper locale-aware relative time formatting.
 * Falls back to short format (e.g., "2h", "3m") for very recent times,
 * and full relative format (e.g., "3 months ago") for older times.
 *
 * @returns Object with formatRelativeTime function
 *
 * @example
 * const { formatRelativeTime } = useRelativeTime();
 * const timeAgo = formatRelativeTime(new Date(post.indexed_at));
 * // Returns: "now", "5m", "2h", "3 days ago", "2 months ago", etc.
 */
export function useRelativeTime() {
  const format = useFormatter();
  const t = useTranslations('time');

  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    // Short format for very recent times
    if (diffMins < 1) return t('now');
    if (diffMins < 60) return t('minutesShort', { count: diffMins });
    if (diffHours < 24) return t('hoursShort', { count: diffHours });

    // Use next-intl's relative time formatting for older times
    return format.relativeTime(date, now);
  }

  return { formatRelativeTime };
}
