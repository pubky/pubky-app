'use client';

import { useFeatureReminderDue } from '@/hooks/useFeatureReminderDue/useFeatureReminderDue';
import { vibesReminder } from '@/libs/vibes/vibesReminder';
import { useAuthStore } from '@/stores/auth/auth.store';

export function useVibesAlert() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const visible = useFeatureReminderDue(vibesReminder, currentUserPubky);

  return {
    visible,
    remindLater: () => {
      if (currentUserPubky && visible) vibesReminder.snooze(currentUserPubky);
    },
  };
}
