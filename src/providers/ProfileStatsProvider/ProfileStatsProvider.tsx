'use client';

import { createContext, useContext } from 'react';
import type { ProfileStats } from '@/hooks/useProfileStats/useProfileStats.types';

const ProfileStatsContext = createContext<ProfileStats | null>(null);

/**
 * Shares the profile layout's counts read with the profile tabs. Mounted by `ProfilePageContainer`,
 * which owns the single `useProfileHeader` instance: a tab reading the counts itself would mount a
 * second local-first query for the same row.
 */
export function ProfileStatsProvider({ value, children }: { value: ProfileStats; children: React.ReactNode }) {
  return <ProfileStatsContext.Provider value={value}>{children}</ProfileStatsContext.Provider>;
}

/** The profile layout's counts, or `null` outside `ProfileStatsProvider`. */
export function useProfileStatsContext(): ProfileStats | null {
  return useContext(ProfileStatsContext);
}
