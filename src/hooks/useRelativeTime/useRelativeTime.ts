'use client';

import { useTranslations } from 'next-intl';

/**
 * Hook to format relative time with localization support.
 *
 * Uses locale-specific compact labels for every duration (e.g., "2h", "3w", "6M", "1Y 1M").
 *
 * @returns Object with formatRelativeTime function
 *
 * @example
 * const { formatRelativeTime } = useRelativeTime();
 * const timeAgo = formatRelativeTime(new Date(post.indexed_at));
 * // Returns: "4s", "5m", "2h", "3d", "5w", "6M", "1Y 1M", "2Y", etc.
 */
export function useRelativeTime() {
  const t = useTranslations('time');

  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
    const diffMins = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffWeeks / 4);
    const diffYears = Math.floor(diffMonths / 12);
    const remainderMonths = diffMonths % 12;

    if (diffSeconds < 60) return t('secondsShort', { count: diffSeconds });
    if (diffMins < 60) return t('minutesShort', { count: diffMins });
    if (diffHours < 24) return t('hoursShort', { count: diffHours });
    if (diffDays < 7) return t('daysShort', { count: diffDays });
    if (diffWeeks < 8) return t('weeksShort', { count: diffWeeks });
    if (diffMonths < 12) return t('monthsShort', { count: diffMonths });
    if (remainderMonths === 0) return t('yearsShort', { count: diffYears });
    return `${t('yearsShort', { count: diffYears })} ${t('monthsShort', { count: remainderMonths })}`;
  }

  return { formatRelativeTime };
}
