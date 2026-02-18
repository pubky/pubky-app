import {
  NotificationStore,
  NotificationActions,
  notificationInitialState,
  NotificationActionTypes,
  NotificationState,
} from './notification.types';
import { ZustandSet } from '../stores.types';

// Actions/Mutators - State modification functions
export const createNotificationActions = (set: ZustandSet<NotificationStore>): NotificationActions => ({
  setState: (state: NotificationState) => {
    if (typeof state.unread === 'number') {
      state.unread = Math.max(0, state.unread);
    }
    set(state, false, NotificationActionTypes.INIT);
  },

  setLastRead: (lastRead: number) => {
    set({ lastRead }, false, NotificationActionTypes.SET_LAST_READ);
  },

  setLastPolledTimestamp: (lastPolledTimestamp: number | undefined) => {
    set({ lastPolledTimestamp }, false, NotificationActionTypes.SET_LAST_POLLED_TIMESTAMP);
  },

  setUnread: (unread: number) => {
    // Ensure unread count is never negative
    const validUnread = Math.max(0, unread);
    set({ unread: validUnread }, false, NotificationActionTypes.SET_UNREAD);
  },

  reset: () => {
    set(notificationInitialState, false, NotificationActionTypes.RESET);
  },
});
